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
    private DateTimeOffset? _nextCheckInAt;
    private DateTimeOffset? _sessionExpiresAt;
    private bool _sosBusy;
    private CancellationTokenSource? _sosHold;
    private bool _sosHoldCompleted;
    private bool _restoringSession;
    private bool _localReminderEnabled;
    private CancellationTokenSource? _sessionExpiry;
    private const string ActiveSessionPreference = "marg_rakshak_active_session_id";

    public MainPage()
    {
        InitializeComponent();
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
#if ANDROID
        SetLocationListener(true);
#endif
        try { await _auth.GetAccessTokenAsync(); AccountButton.Text = "Account"; }
        catch { AccountButton.Text = "Sign in"; }
        await RestoreSessionAsync();
    }

    protected override void OnDisappearing()
    {
#if IOS || ANDROID
        _sosHold?.Cancel();
        _sosHoldCompleted = false;
        SosButton.Text = "Hold SOS for 2.5 seconds";
#endif
#if ANDROID
        if (!_sessionActive) SetLocationListener(false);
#endif
        base.OnDisappearing();
    }

#if ANDROID
    private void SetLocationListener(bool enabled)
    {
        LocationSampleStore.Updated -= OnBackgroundLocationChanged;
        if (enabled) LocationSampleStore.Updated += OnBackgroundLocationChanged;
    }
#endif

    public void SetAccountStatus(string? email) => AccountButton.Text = string.IsNullOrWhiteSpace(email) ? "Sign in" : $"Signed in · {email}";

    private async void OnAccountClicked(object? sender, EventArgs e) => await Shell.Current.GoToAsync("account");

    private async void OnSessionClicked(object? sender, EventArgs e)
    {
        if (_sessionActive)
        {
            _sessionExpiry?.Cancel();
            _sessionActive = false;
#if ANDROID
            SetLocationListener(false);
#endif
            StopBackgroundLocation();
            try { if (_sessionId is not null) await _api.EndSessionAsync(_sessionId); }
            catch (Exception ex) { await DisplayAlertAsync("Session ended locally", $"The phone stopped tracking, but server closure could not be confirmed: {ex.Message}", "OK"); }
            _sessionId = null;
            _nextCheckInAt = null;
            _sessionExpiresAt = null;
            Preferences.Default.Remove(ActiveSessionPreference);
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
#if IOS
        await DisplayAlertAsync("Android required", "Continuous background location sharing is currently supported on Android only. Account and contact features may be used here, but do not start a safety session on this device.", "OK");
        return;
#endif
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
#if ANDROID
            _localReminderEnabled = await Permissions.RequestAsync<Permissions.PostNotifications>() == PermissionStatus.Granted;
            if (!_localReminderEnabled)
                await DisplayAlertAsync("Check-in reminders are off", "You can still start the session, but this phone will not show an on-time check-in reminder. The server alert also requires the backend setup to be completed.", "Continue");
#endif
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
            Preferences.Default.Set(ActiveSessionPreference, _sessionId);
            _nextCheckInAt = created.NextCheckInAt;
            _sessionExpiresAt = created.ExpiresAt;
            _sosEventKey = Guid.NewGuid().ToString();
            await _api.UpdateLocationAsync(_sessionId, Guid.NewGuid().ToString(), location.Latitude, location.Longitude, location.Accuracy ?? 0);
            StartBackgroundLocation(minutes, _nextCheckInAt, created.ExpiresAt);
            _sessionActive = true;
            _sessionExpiry?.Cancel();
            _sessionExpiry = new CancellationTokenSource();
            _ = EndSessionWhenExpiredAsync(TimeSpan.FromMinutes(minutes), _sessionExpiry.Token);
            CheckInButton.IsEnabled = true;
            CheckInStatusLabel.Text = FormatCheckInStatus(_nextCheckInAt);
            LocationStatusLabel.Text = $"Fresh · ±{Math.Round(location.Accuracy ?? 0)} m";
            var destinationText = string.IsNullOrWhiteSpace(destination) ? "" : $" Destination: {destination}.";
            var reminderText = _localReminderEnabled ? "A phone reminder will appear when each check-in is due." : "This phone has no check-in reminder enabled.";
            SetSessionState("CLOUD SESSION", "Session is active", $"Location is being sent to your Supabase session. Check in every 15 minutes. {reminderText} Selected contacts may receive an email if you are 5 minutes late; email delivery is not confirmed.{destinationText}", "End safety session");
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
                Preferences.Default.Remove(ActiveSessionPreference);
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

    private void SetSessionState(string status, string headline, string description, string buttonText)
    {
        var attention = status == "ATTENTION NEEDED";
        SharingFootnoteLabel.Text = _sessionActive ? "Location sharing is active for this session." : "Location is not being shared.";
        StatusLabel.Text = status;
        StatusLabel.TextColor = attention ? Color.FromArgb("#865917") : _sessionActive ? Color.FromArgb("#126B5A") : Color.FromArgb("#647780");
        StatusPill.BackgroundColor = attention ? Color.FromArgb("#FFF1D8") : _sessionActive ? Color.FromArgb("#E2F1EC") : Color.FromArgb("#EEF2F2");
        SessionHeadline.Text = headline;
        SessionDescription.Text = description;
        SessionButton.Text = buttonText;
        SemanticScreenReader.Announce(headline);
    }

    private async Task RestoreSessionAsync()
    {
        if (_sessionActive || _restoringSession) return;
        var savedSessionId = Preferences.Default.Get<string?>(ActiveSessionPreference, null);
        if (string.IsNullOrWhiteSpace(savedSessionId)) return;

        _restoringSession = true;
        try
        {
#if ANDROID
            _localReminderEnabled = await Permissions.CheckStatusAsync<Permissions.PostNotifications>() == PermissionStatus.Granted;
#endif
            var session = await _api.GetSessionAsync(savedSessionId);
            if (session is null || session.Status is not ("active" or "alert") || session.ExpiresAt <= DateTimeOffset.UtcNow)
            {
                Preferences.Default.Remove(ActiveSessionPreference);
                CheckInButton.IsEnabled = false;
                CheckInStatusLabel.Text = "No active session";
                return;
            }

            var remaining = session.ExpiresAt - DateTimeOffset.UtcNow;
            _sessionId = session.Id;
            _nextCheckInAt = session.NextCheckInAt;
            _sessionExpiresAt = session.ExpiresAt;
            _sosEventKey = Guid.NewGuid().ToString();
            _sessionActive = true;
            CheckInButton.IsEnabled = true;
            var alertActive = session.Status == "alert";
            CheckInStatusLabel.Text = alertActive ? "Alert active · check in now" : FormatCheckInStatus(_nextCheckInAt);
            LocationStatusLabel.Text = "Session restored · checking location";
            var destinationText = string.IsNullOrWhiteSpace(session.Destination) ? "" : $" Destination: {session.Destination}.";
            var headline = alertActive ? "Session needs attention" : "Session is active";
            var description = alertActive
                ? $"The session has an active alert. If you are safe, check in now. Contacts may have received an email; delivery is not confirmed.{destinationText}"
                : $"Location sharing continues. Check in every 15 minutes. {(_localReminderEnabled ? "A phone reminder will appear when due." : "No phone reminder is enabled.")} Selected contacts may receive an email if you are 5 minutes late; email delivery is not confirmed.{destinationText}";
            SetSessionState(alertActive ? "ATTENTION NEEDED" : "CLOUD SESSION", headline, description, "End safety session");
            StartBackgroundLocation(Math.Max(1, (int)Math.Ceiling(remaining.TotalMinutes)), _nextCheckInAt, session.ExpiresAt);
            _sessionExpiry?.Cancel();
            _sessionExpiry = new CancellationTokenSource();
            _ = EndSessionWhenExpiredAsync(remaining, _sessionExpiry.Token);
        }
        catch (Exception ex)
        {
            LocationStatusLabel.Text = "Could not reconnect to session";
            CheckInStatusLabel.Text = "Session status unavailable";
            await DisplayAlertAsync("Session not confirmed", $"The saved session could not be checked with Supabase. Retry when you have a connection. {ex.Message}", "OK");
        }
        finally
        {
            _restoringSession = false;
        }
    }

    private async Task EndSessionWhenExpiredAsync(TimeSpan remaining, CancellationToken cancellationToken)
    {
        try
        {
            await Task.Delay(remaining, cancellationToken);
            await MainThread.InvokeOnMainThreadAsync(async () =>
            {
                if (!_sessionActive) return;
                _sessionExpiry?.Cancel();
                _sessionActive = false;
#if ANDROID
                SetLocationListener(false);
#endif
                StopBackgroundLocation();
                try { if (_sessionId is not null) await _api.EndSessionAsync(_sessionId); } catch { }
                _sessionId = null;
                _nextCheckInAt = null;
                _sessionExpiresAt = null;
                Preferences.Default.Remove(ActiveSessionPreference);
                CheckInButton.IsEnabled = false;
                CheckInStatusLabel.Text = "Session expired";
                SetSessionState("SESSION ENDED", "Session time is up", "Location tracking has stopped. A contact email may have been attempted if a check-in was overdue.", "Start safety session");
                await DisplayAlertAsync("Session ended", "The selected session duration is over and location tracking has stopped.", "OK");
            });
        }
        catch (OperationCanceledException) { }
    }

    private string FormatCheckInStatus(DateTimeOffset? due)
    {
        var schedule = due is { } next ? $"Check in by {next.ToLocalTime():t} · every 15 min" : "Check in every 15 minutes";
        return _localReminderEnabled ? $"{schedule} · phone reminder on" : $"{schedule} · phone reminder off";
    }

    private static void StartBackgroundLocation(int durationMinutes, DateTimeOffset? nextCheckInAt, DateTimeOffset expiresAt)
    {
#if ANDROID
        var context = Android.App.Application.Context;
        var intent = new Android.Content.Intent(context, typeof(SafetyLocationService));
        intent.SetAction(SafetyLocationService.ActionStart);
        intent.PutExtra("durationMinutes", durationMinutes);
        var next = nextCheckInAt ?? DateTimeOffset.UtcNow.AddMinutes(15);
        intent.PutExtra("nextCheckInAtUtcTicks", next.UtcDateTime.Ticks);
        intent.PutExtra("expiresAtUtcTicks", expiresAt.UtcDateTime.Ticks);
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

    private static void UpdateCheckInReminder(DateTimeOffset? nextCheckInAt)
    {
#if ANDROID
        if (nextCheckInAt is not { } next) return;
        var context = Android.App.Application.Context;
        var intent = new Android.Content.Intent(context, typeof(SafetyLocationService));
        intent.SetAction(SafetyLocationService.ActionScheduleCheckIn);
        intent.PutExtra("nextCheckInAtUtcTicks", next.UtcDateTime.Ticks);
        context.StartService(intent);
#endif
    }

    private async void OnCheckInClicked(object? sender, EventArgs e)
    {
        if (!_sessionActive || _sessionId is null) return;
        CheckInButton.IsEnabled = false;
        try
        {
            var result = await _api.CheckInAsync(_sessionId, Guid.NewGuid().ToString());
            if (!result.Success) throw new InvalidOperationException("The server did not accept this check-in.");
            _nextCheckInAt = result.NextCheckInAt;
            UpdateCheckInReminder(_nextCheckInAt);
            CheckInStatusLabel.Text = _nextCheckInAt is { } due
                ? $"Checked in · next by {due.ToLocalTime():t}" + (_localReminderEnabled ? " · reminder on" : " · reminder off")
                : "Check-in recorded";
            if (result.Status == "alert")
                SetSessionState("ATTENTION NEEDED", "Session alert remains active", "Your check-in was recorded, but an earlier SOS alert remains active. Contacts may already have received an email; delivery is not confirmed.", "End safety session");
            else
                SetSessionState("CLOUD SESSION", "Session is active", "Your check-in was recorded. If you were overdue, a contact email may already have been attempted; delivery is not confirmed.", "End safety session");
            SemanticScreenReader.Announce("Check-in recorded");
        }
        catch (Exception ex)
        {
            CheckInStatusLabel.Text = "Check-in could not be confirmed";
            await DisplayAlertAsync("Check-in not confirmed", $"The server could not confirm your check-in. Please retry while the session is active. {ex.Message}", "OK");
        }
        finally
        {
            CheckInButton.IsEnabled = _sessionActive;
        }
    }

    private async void OnSosPressed(object? sender, EventArgs e)
    {
        _sosHold?.Cancel();
        _sosHold?.Dispose();
        _sosHold = new CancellationTokenSource();
        _sosHoldCompleted = false;
        SosButton.Text = "Keep holding…";
        try
        {
            await Task.Delay(TimeSpan.FromSeconds(2.5), _sosHold.Token);
            _sosHoldCompleted = true;
            SosButton.Text = "Release to send SOS";
        }
        catch (OperationCanceledException) { }
    }

    private void OnSosReleased(object? sender, EventArgs e)
    {
        _sosHold?.Cancel();
        if (!_sosHoldCompleted) SosButton.Text = "Hold SOS for 2.5 seconds";
    }

    private async void OnSosClicked(object? sender, EventArgs e)
    {
        if (!_sosHoldCompleted)
        {
            SosButton.Text = "Hold SOS for 2.5 seconds";
            return;
        }
        _sosHoldCompleted = false;
        SosButton.Text = "Hold SOS for 2.5 seconds";
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
                    if (result.Recorded)
                        SetSessionState("ATTENTION NEEDED", "SOS recorded", "An SOS event is active. Contact email acceptance does not confirm delivery. Call 112 if you need emergency help.", "End safety session");
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












