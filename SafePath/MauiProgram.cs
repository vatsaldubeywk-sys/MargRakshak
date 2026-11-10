using Microsoft.Extensions.Logging;
using SafePath.Services;

namespace SafePath;

public static class MauiProgram
{
    public static IServiceProvider Services { get; private set; } = null!;

    public static MauiApp CreateMauiApp()
    {
        var builder = MauiApp.CreateBuilder();
        builder.UseMauiApp<App>().ConfigureFonts(fonts =>
        {
            fonts.AddFont("OpenSans-Regular.ttf", "OpenSansRegular");
            fonts.AddFont("OpenSans-Semibold.ttf", "OpenSansSemibold");
        });
#if DEBUG
        builder.Logging.AddDebug();
#endif
        builder.Services.AddSingleton<HttpClient>();
        builder.Services.AddSingleton<SupabaseAuthService>();
        builder.Services.AddSingleton<SupabaseFunctionsService>();
        var app = builder.Build();
        Services = app.Services;
        return app;
    }
}
