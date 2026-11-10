using Android.App;
using Android.Content;
using Android.OS;
using Android.Locations;
using Microsoft.Maui.Storage;
using AndroidLocation = Android.Locations.Location;

namespace SafePath;

[Service(ForegroundServiceType = Android.Content.PM.ForegroundService.TypeLocation, Exported = false)]
public sealed class SafetyLocationService : Service, ILocationListener
{
    public const string ActionStart = "com.safepath.action.START_LOCATION";
    public const string ActionStop = "com.safepath.action.STOP_LOCATION";
    private const string ChannelId = "safety_session";
    private const string CheckInChannelId = "safety_checkin_reminders";
    private const int CheckInNotificationId = 42;
    private const string NextCheckInPreference = "marg_rakshak_next_checkin_utc_ticks";
    private const string SessionExpiryPreference = "marg_rakshak_session_expiry_utc_ticks";
    private LocationManager? _manager;
    private Handler? _expiryHandler;
    private Java.Lang.Runnable? _expiryCallback;
    private Handler? _checkInHandler;
    private Java.Lang.Runnable? _checkInCallback;

    public override IBinder? OnBind(Intent? intent) => null;

    public override StartCommandResult OnStartCommand(Intent? intent, StartCommandFlags flags, int startId)
    {
        if (intent?.Action == ActionStop)
        {
            StopSelf();
            return StartCommandResult.NotSticky;
        }

        var notification = CreateSessionNotification();
        if (OperatingSystem.IsAndroidVersionAtLeast(29))
            StartForeground(41, notification, Android.Content.PM.ForegroundService.TypeLocation);
        else
            StartForeground(41, notification);

        var duration = Math.Clamp(intent?.GetIntExtra("durationMinutes", 60) ?? 60, 1, 120);
        if (_expiryHandler is not null && _expiryCallback is not null) _expiryHandler.RemoveCallbacks(_expiryCallback);
        _expiryHandler = new Handler(Looper.MainLooper!);
        _expiryCallback = new Java.Lang.Runnable(() => StopSelf());
        var expiryTicks = intent?.GetLongExtra("expiresAtUtcTicks", 0) ?? 0;
        if (expiryTicks <= 0) expiryTicks = Preferences.Default.Get(SessionExpiryPreference, 0L);
        if (expiryTicks <= 0) expiryTicks = DateTimeOffset.UtcNow.AddMinutes(duration).UtcDateTime.Ticks;
        Preferences.Default.Set(SessionExpiryPreference, expiryTicks);
        var remainingMs = Math.Max(0, (expiryTicks - DateTimeOffset.UtcNow.UtcDateTime.Ticks) / TimeSpan.TicksPerMillisecond);
        _expiryHandler.PostDelayed(_expiryCallback, remainingMs);

        var checkInTicks = intent?.GetLongExtra("nextCheckInAtUtcTicks", 0) ?? 0;
        if (checkInTicks <= 0) checkInTicks = Preferences.Default.Get(NextCheckInPreference, 0L);
        if (checkInTicks <= 0) checkInTicks = DateTimeOffset.UtcNow.AddMinutes(15).UtcDateTime.Ticks;
        ScheduleCheckInReminder(checkInTicks);

        _manager = (LocationManager?)GetSystemService(LocationService);
        try
        {
            _manager?.RemoveUpdates(this);
            _manager?.RequestLocationUpdates(LocationManager.GpsProvider, 15000, 10, this, Looper.MainLooper);
        }
        catch (Java.Lang.SecurityException)
        {
            StopSelf();
        }
        return StartCommandResult.Sticky;
    }

    private void ScheduleCheckInReminder(long dueUtcTicks)
    {
        if (_checkInHandler is not null && _checkInCallback is not null)
            _checkInHandler.RemoveCallbacks(_checkInCallback);

        Preferences.Default.Set(NextCheckInPreference, dueUtcTicks);
        var expiryTicks = Preferences.Default.Get(SessionExpiryPreference, 0L);
        if (expiryTicks > 0 && dueUtcTicks >= expiryTicks) return;

        var due = new DateTimeOffset(dueUtcTicks, TimeSpan.Zero);
        var delay = Math.Max(0, (long)(due - DateTimeOffset.UtcNow).TotalMilliseconds);
        _checkInHandler ??= new Handler(Looper.MainLooper!);
        _checkInCallback = new Java.Lang.Runnable(() =>
        {
            ShowCheckInReminder();
            var nextDue = due.AddMinutes(15).UtcDateTime.Ticks;
            ScheduleCheckInReminder(nextDue);
        });
        _checkInHandler.PostDelayed(_checkInCallback, delay);
    }

    private void ShowCheckInReminder()
    {
        var manager = (Android.App.NotificationManager?)GetSystemService(NotificationService);
        if (OperatingSystem.IsAndroidVersionAtLeast(26))
        {
            var channel = new NotificationChannel(CheckInChannelId, "Safety check-in reminders", NotificationImportance.Default)
            {
                Description = "Reminds you when a Marg Rakshak safety-session check-in is due."
            };
            channel.EnableVibration(true);
            channel.SetVibrationPattern(new long[] { 0, 250, 150, 250 });
            manager?.CreateNotificationChannel(channel);
        }

        var launch = new Intent(this, typeof(MainActivity));
        launch.SetFlags(ActivityFlags.SingleTop | ActivityFlags.ClearTop);
        var pendingIntentFlags = PendingIntentFlags.UpdateCurrent;
        if (OperatingSystem.IsAndroidVersionAtLeast(23)) pendingIntentFlags |= PendingIntentFlags.Immutable;
        var contentIntent = PendingIntent.GetActivity(
            this,
            CheckInNotificationId,
            launch,
            pendingIntentFlags);

        Notification.Builder builder;
        if (OperatingSystem.IsAndroidVersionAtLeast(26))
            builder = new Notification.Builder(this, CheckInChannelId);
        else
        {
            builder = new Notification.Builder(this);
            builder.SetPriority((int)NotificationPriority.Default);
        }
        var reminder = builder
            .SetContentTitle("Safety check-in due")
            .SetContentText("Open Marg Rakshak and tap “I am okay · check in”.")
            .SetSmallIcon(global::Android.Resource.Drawable.IcMenuMyLocation)
            .SetContentIntent(contentIntent)
            .SetAutoCancel(true)
            .Build();
        manager?.Notify(CheckInNotificationId, reminder);
    }

    private Notification CreateSessionNotification()
    {
        if (OperatingSystem.IsAndroidVersionAtLeast(26))
        {
            var channel = new NotificationChannel(ChannelId, "Safety session", NotificationImportance.Low)
            {
                Description = "Visible status while a user-started session samples location."
            };
            ((NotificationManager)GetSystemService(NotificationService)!).CreateNotificationChannel(channel);
            return new Notification.Builder(this, ChannelId)
                .SetContentTitle("Marg Rakshak session active")
                .SetContentText("Location is being sampled on this device.")
                .SetSmallIcon(global::Android.Resource.Drawable.IcMenuMyLocation)
                .SetOngoing(true)
                .Build();
        }

        return new Notification.Builder(this)
            .SetContentTitle("Marg Rakshak session active")
            .SetContentText("Location is being sampled on this device.")
            .SetSmallIcon(global::Android.Resource.Drawable.IcMenuMyLocation)
            .SetOngoing(true)
            .Build();
    }

    public override void OnDestroy()
    {
        _manager?.RemoveUpdates(this);
        if (_expiryHandler is not null && _expiryCallback is not null) _expiryHandler.RemoveCallbacks(_expiryCallback);
        if (_checkInHandler is not null && _checkInCallback is not null) _checkInHandler.RemoveCallbacks(_checkInCallback);
        ((Android.App.NotificationManager?)GetSystemService(NotificationService))?.Cancel(CheckInNotificationId);
        Preferences.Default.Remove(NextCheckInPreference);
        Preferences.Default.Remove(SessionExpiryPreference);
        base.OnDestroy();
    }

    public void OnLocationChanged(AndroidLocation location) => LocationSampleStore.Publish(location);
    public void OnProviderDisabled(string provider) { }
    public void OnProviderEnabled(string provider) { }
    public void OnStatusChanged(string? provider, Availability status, Bundle? extras) { }
}

public static class LocationSampleStore
{
    public static AndroidLocation? Latest { get; private set; }
    public static event Action<AndroidLocation>? Updated;
    public static void Publish(AndroidLocation location)
    {
        Latest = location;
        Updated?.Invoke(location);
    }
}



