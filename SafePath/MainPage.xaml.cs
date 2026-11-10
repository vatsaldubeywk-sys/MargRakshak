using Microsoft.Extensions.DependencyInjection;
using SafePath.Services;

namespace SafePath;

public partial class MainPage : ContentPage
{
    private readonly SupabaseAuthService _auth = MauiProgram.Services.GetRequiredService<SupabaseAuthService>();
    private readonly SupabaseFunctionsService _api = MauiProgram.Services.GetRequiredService<SupabaseFunctionsService>();
    private bool _sessionActive;
    private bool _locationBusy;
    private string? _sessionId;
    private string? _sosEventKey;
    private bool _sosBusy;
    private CancellationTokenSource? _sessionExpiry;

    public MainPage()
    {
        InitializeComponent();
#if ANDROID
        LocationSampleStore.Updated += OnBackgroundLocationChanged;
#endif
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        try { await _auth.GetAccessTokenAsync(); AccountButton.Text = "Account"; }
        catch { AccountButton.Text = "Sign in"; }
    }

    public void SetAccountStatus(string? email) => AccountButton.Text = string.IsNullOrWhiteSpace(email) ? "Sign in" : $"Signed in · {email}";

    private async void OnAccountClicked(object? sender, EventArgs e) => await Shell.Current.GoToAsync("account");

    private async void OnSessionClicked(object? sender, EventArgs e)
    {
        if (_sessionActive)
        {
            _sessionExpiry?.Cancel();
            _sessionActive = false;
            StopBackgroundLocation();
            try { if (_sessionId is not null) await _api.EndSessionAsync(_sessionId); }
            catch (Exception ex) { await DisplayAlertAsync("Session ended locally", $"The phone stopped tracking, but server closure could not be confirmed: {ex.Message}", "OK"); }
            _sessionId = null;
            CheckInButton.IsEnabled = false;
            CheckInStatusLabel.Text = "No active session";
            LocationStatusLabel.Text = "Not checked";
            SetSessionState("NOT SHARING", "No active session", "Session ended. Contact access is revoked when the server confirms the end.", "Start safety session");
            return;
        }
        await Shell.Current.GoToAsync("session-setup");
    }

    public async Task StartLocalSessionAsync(int minutes, string? destination, IReadOnlyList<string> contactIds)
    {
        if (_locationBusy) return;
        try { await _auth.GetAccessTokenAsync(); }
        catch
        {
            await DisplayAlertAsync("Sign in required", "Sign in before starting a cloud session.", "OK");
            await Shell.Current.GoToAsync("account");
            return;
        }

        _locationBusy = true;
        SessionButton.IsEnabled = false;
        SessionButton.Text = "Checking location permission…";
        try
        {
            var permission = await Permissions.RequestAsync<Permissions.LocationWhenInUse>();
            if (permission != PermissionStatus.Granted)
            {
                LocationStatusLabel.Text = "Permission not granted";
                await DisplayAlertAsync("Location permission needed", "Allow location while using the app to start this session.", "OK");
                return;
            }
            var location = await Geolocation.GetLocationAsync(new GeolocationRequest(GeolocationAccuracy.Medium, TimeSpan.FromSeconds(10)));
            if (location is null)
            {
                LocationStatusLabel.Text = "Location unavailable";
                await DisplayAlertAsync("Location unavailable", "No location sample was returned. No cloud session was created.", "OK");
                return;
            }

            var created = await _api.StartSessionAsync(minutes, contactIds, destination);
            if (string.IsNullOrWhiteSpace(created.SessionId)) throw new InvalidOperationException("The server did not return a session ID.");
            _sessionId = created.SessionId;
            _sosEventKey = Guid.NewGuid().ToString();
            await _api.UpdateLocationAsync(_sessionId, Guid.NewGuid().ToString(), location.Latitude, location.Longitude, location.Accuracy ?? 0);
            StartBackgroundLocation(minutes);
            _sessionActive = true;
            _sessionExpiry?.Cancel();
            _sessionExpiry = new CancellationTokenSource();
            _ = EndSessionWhenExpiredAsync(minutes, _sessionExpiry.Token);
            CheckInButton.IsEnabled = true;
            CheckInStatusLabel.Text = $"Duration: {minutes} minutes";
            LocationStatusLabel.Text = $"Fresh · ±{Math.Round(location.Accuracy ?? 0)} m";
            var destinationText = string.IsNullOrWhiteSpace(destination) ? "" : $" Destination: {destination}.";
            SetSessionState("CLOUD SESSION", "Session is active", $"Location is being sent to your Supabase session. Selected responders can view it. Manual SOS email requires provider setup and does not confirm delivery.{destinationText}", "End safety session");
        }
        catch (FeatureNotEnabledException)
        {
            LocationStatusLabel.Text = "Location is off";
            await DisplayAlertAsync("Turn on location", "Enable device location services, then try again.", "OK");
        }
        catch (PermissionException)
        {
            LocationStatusLabel.Text = "Permission unavailable";
            await DisplayAlertAsync("Permission unavailable", "Review location permission for Marg Rakshak in Android settings.", "OK");
        }
        catch (Exception ex)
        {
            if (_sessionId is not null)
            {
                try { await _api.EndSessionAsync(_sessionId); } catch { }
                _sessionId = null;
            }
            StopBackgroundLocation();
            LocationStatusLabel.Text = "Session not started";
            await DisplayAlertAsync("Could not start session", ex.Message, "OK");
        }
        finally
        {
            _locationBusy = false;
            SessionButton.IsEnabled = true;
            if (!_sessionActive) SessionButton.Text = "Start safety session";
        }
    }

#if ANDROID
#if ANDROID
    private async void OnBackgroundLocationChanged(Android.Locations.Location location)
    {
        if (!_sessionActive || _sessionId is null) return;
        try
        {
            await _api.UpdateLocationAsync(_sessionId, Guid.NewGuid().ToString(), location.Latitude, location.Longitude, location.Accuracy);
            MainThread.BeginInvokeOnMainThread(() => LocationStatusLabel.Text = $"Fresh · ±{Math.Round(location.Accuracy)} m");
        }
        catch
        {
            MainThread.BeginInvokeOnMainThread(() => LocationStatusLabel.Text = "Update delayed · last sample retained");
        }
    }

#endif

#endif

    private void SetSessionState(string status, string headline, string description, string buttonText)
    {
        SharingFootnoteLabel.Text = _sessionActive ? "Location sharing is active for this session." : "Location is not being shared.";
        StatusLabel.Text = status;
        StatusLabel.TextColor = _sessionActive ? Color.FromArgb("#126B5A") : Color.FromArgb("#647780");
        StatusPill.BackgroundColor = _sessionActive ? Color.FromArgb("#E2F1EC") : Color.FromArgb("#EEF2F2");
        SessionHeadline.Text = headline;
        SessionDescription.Text = description;
        SessionButton.Text = buttonText;
        SemanticScreenReader.Announce(headline);
    }

    private async Task EndSessionWhenExpiredAsync(int minutes, CancellationToken cancellationToken)
    {
        try
        {
            await Task.Delay(TimeSpan.FromMinutes(minutes), cancellationToken);
            await MainThread.InvokeOnMainThreadAsync(async () =>
            {
                if (!_sessionActive) return;
                _sessionExpiry?.Cancel();
            _sessionActive = false;
                StopBackgroundLocation();
                try { if (_sessionId is not null) await _api.EndSessionAsync(_sessionId); } catch { }
                _sessionId = null;
                CheckInButton.IsEnabled = false;
                CheckInStatusLabel.Text = "Session expired";
                SetSessionState("SESSION ENDED", "Session time is up", "Location tracking has stopped. No contact alerts were sent.", "Start safety session");
                await DisplayAlertAsync("Session ended", "The selected session duration is over and location tracking has stopped.", "OK");
            });
        }
        catch (OperationCanceledException) { }
    }

    private static void StartBackgroundLocation(int durationMinutes)
    {
#if ANDROID
        var context = Android.App.Application.Context;
        var intent = new Android.Content.Intent(context, typeof(SafetyLocationService));
        intent.SetAction(SafetyLocationService.ActionStart);
        intent.PutExtra("durationMinutes", durationMinutes);
        if (OperatingSystem.IsAndroidVersionAtLeast(26)) context.StartForegroundService(intent);
        else context.StartService(intent);
#endif
    }

    private static void StopBackgroundLocation()
    {
#if ANDROID
        var context = Android.App.Application.Context;
        var intent = new Android.Content.Intent(context, typeof(SafetyLocationService));
        intent.SetAction(SafetyLocationService.ActionStop);
        context.StartService(intent);
#endif
    }

    private async void OnCheckInClicked(object? sender, EventArgs e)
    {
        if (_sessionActive) await DisplayAlertAsync("Local check-in only", "This prototype does not save your check-in or start an automatic no-response timer.", "OK");
    }

    private async void OnSosClicked(object? sender, EventArgs e)
    {
        if (_sosBusy) return;
        _sosBusy = true;
        SosButton.IsEnabled = false;
        try
        {
            var status = "No active cloud session, so no SOS event was recorded.";
            if (_sessionActive && _sessionId is not null)
            {
                try
                {
                    _sosEventKey ??= Guid.NewGuid().ToString();
                    var result = await _api.CreateSosAsync(_sessionId, _sosEventKey);
                    status = !result.Recorded ? "The SOS event could not be confirmed." : result.EmailsAccepted > 0 ? $"SOS recorded. The email provider accepted alerts for {result.EmailsAccepted} of {result.EmailsAttempted} contacts. Delivery is not confirmed." : $"SOS recorded, but no email alert was accepted ({result.NotificationStatus ?? "unknown"}). Contact your trusted people directly.";
                }
                catch (Exception ex) { status = $"The SOS event could not be recorded: {ex.Message}"; }
            }
            var call = await DisplayAlertAsync("SOS status", $"{status} You can open the phone dialer for 112.", "Open dialer", "Cancel");
            if (call) await Launcher.OpenAsync("tel:112");
        }
        finally
        {
            _sosBusy = false;
            SosButton.IsEnabled = true;
        }
    }

    private async void OnContactsClicked(object? sender, EventArgs e) => await Shell.Current.GoToAsync("contacts");
}












