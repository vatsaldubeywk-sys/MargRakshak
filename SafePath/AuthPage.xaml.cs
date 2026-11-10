using SafePath.Services;

namespace SafePath;

public partial class AuthPage : ContentPage
{
    private readonly SupabaseAuthService _auth = MauiProgram.Services.GetRequiredService<SupabaseAuthService>();
    public AuthPage() => InitializeComponent();

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        try
        {
            await _auth.GetAccessTokenAsync();
            SignOutButton.IsVisible = true;
            MessageLabel.Text = "Signed in. Session data is protected by your account.";
        }
        catch { SignOutButton.IsVisible = false; }
    }

    private async void OnSignInClicked(object? sender, EventArgs e) => await RunAuthAsync(false);
    private async void OnSignUpClicked(object? sender, EventArgs e) => await RunAuthAsync(true);

    private async Task RunAuthAsync(bool createAccount)
    {
        var email = EmailEntry.Text?.Trim();
        var password = PasswordEntry.Text;
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
        { MessageLabel.Text = "Enter your email and password."; return; }
        SetBusy(true);
        try
        {
            var result = createAccount ? await _auth.SignUpAsync(email, password) : await _auth.SignInAsync(email, password);
            if (string.IsNullOrWhiteSpace(result.AccessToken))
            {
                MessageLabel.Text = "Account created. Check your email to confirm it, then sign in.";
                return;
            }
            if (Shell.Current.Navigation.NavigationStack.FirstOrDefault(p => p is MainPage) is MainPage home)
                home.SetAccountStatus(email);
            await Shell.Current.GoToAsync("..");
        }
        catch (Exception ex) { MessageLabel.Text = ex.Message; }
        finally { SetBusy(false); }
    }

    private async void OnSignOutClicked(object? sender, EventArgs e)
    {
        try
        {
            await _auth.SignOutAsync();
            SignOutButton.IsVisible = false;
            MessageLabel.Text = "Signed out.";
            if (Shell.Current.Navigation.NavigationStack.FirstOrDefault(p => p is MainPage) is MainPage home)
                home.SetAccountStatus(null);
        }
        catch (Exception ex) { MessageLabel.Text = ex.Message; }
    }

    private void SetBusy(bool busy)
    {
        SignInButton.IsEnabled = !busy;
        SignUpButton.IsEnabled = !busy;
        SignOutButton.IsEnabled = !busy;
    }
}
