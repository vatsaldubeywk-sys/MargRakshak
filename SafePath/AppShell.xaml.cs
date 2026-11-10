namespace SafePath;

public partial class AppShell : Shell
{
    public AppShell()
    {
        InitializeComponent();
        Routing.RegisterRoute("account", typeof(AuthPage));
        Routing.RegisterRoute("session-setup", typeof(SessionSetupPage));
        Routing.RegisterRoute("contacts", typeof(ContactsPage));
    }
}
