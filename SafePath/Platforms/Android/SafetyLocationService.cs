using Android.App;
using Android.Content;
using Android.OS;
using Android.Locations;
using AndroidLocation = Android.Locations.Location;

namespace SafePath;

[Service(ForegroundServiceType = Android.Content.PM.ForegroundService.TypeLocation, Exported = false)]
public sealed class SafetyLocationService : Service, ILocationListener
{
    public const string ActionStart = "com.safepath.action.START_LOCATION";
    public const string ActionStop = "com.safepath.action.STOP_LOCATION";
    private const string ChannelId = "safety_session";
    private LocationManager? _manager;
    private Handler? _expiryHandler;
    private Java.Lang.Runnable? _expiryCallback;

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
        _expiryHandler.PostDelayed(_expiryCallback, duration * 60_000L);
        _manager = (LocationManager?)GetSystemService(LocationService);
        try
        {
            _manager?.RequestLocationUpdates(LocationManager.GpsProvider, 15000, 10, this, Looper.MainLooper);
        }
        catch (Java.Lang.SecurityException)
        {
            StopSelf();
        }
        return StartCommandResult.Sticky;
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



