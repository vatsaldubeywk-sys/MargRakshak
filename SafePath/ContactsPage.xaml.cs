using System.Collections.ObjectModel;
using Microsoft.Extensions.DependencyInjection;
using SafePath.Services;

namespace SafePath;

public partial class ContactsPage : ContentPage
{
    private readonly SupabaseFunctionsService _api = MauiProgram.Services.GetRequiredService<SupabaseFunctionsService>();
    private readonly SupabaseAuthService _auth = MauiProgram.Services.GetRequiredService<SupabaseAuthService>();
    private readonly ObservableCollection<TrustedContactDto> _contacts = new();

    public ContactsPage()
    {
        InitializeComponent();
        ContactsList.ItemsSource = _contacts;
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        await LoadContactsAsync();
    }

    private async Task LoadContactsAsync()
    {
        try
        {
            await _auth.GetAccessTokenAsync();
            _contacts.Clear();
            foreach (var contact in await _api.ListContactsAsync()) _contacts.Add(contact);
        }
        catch (Exception ex)
        {
            await DisplayAlertAsync("Sign in required", ex.Message, "OK");
            await Shell.Current.GoToAsync("account");
        }
    }

    private async void OnAcceptClicked(object? sender, EventArgs e)
    {
        var id = await DisplayPromptAsync("Accept invitation", "Paste the invitation ID shared by your contact", "Accept", "Cancel", "Invitation ID", maxLength: 50);
        if (string.IsNullOrWhiteSpace(id)) return;
        try { await _api.AcceptContactAsync(id.Trim()); await LoadContactsAsync(); await DisplayAlertAsync("Contact accepted", "This account can now be selected for sessions with that contact.", "OK"); }
        catch (Exception ex) { await DisplayAlertAsync("Could not accept invitation", ex.Message, "OK"); }
    }

    private async void OnAddClicked(object? sender, EventArgs e)
    {
        var name = await DisplayPromptAsync("Add trusted contact", "Enter their name", "Next", "Cancel", "Name", maxLength: 60);
        if (string.IsNullOrWhiteSpace(name)) return;
        var email = await DisplayPromptAsync("Add trusted contact", "Enter the email they will use to sign in", "Save pending contact", "Cancel", "Email", maxLength: 180, keyboard: Keyboard.Email);
        if (string.IsNullOrWhiteSpace(email)) return;
        try
        {
            var created = await _api.CreateContactAsync(name.Trim(), email.Trim());
            await LoadContactsAsync();
            var inviteMessage = created.InvitationSent ? "The email provider accepted the invitation message; delivery is not confirmed. The contact must sign in with this email and accept the invitation before you can share a session." : "The contact is saved as pending, but no invitation email was accepted. You can copy and share the invitation ID privately. The contact must sign in with this email and accept before you can share a session."; await DisplayAlertAsync("Saved as pending", inviteMessage, "OK");
        }
        catch (Exception ex) { await DisplayAlertAsync("Could not add contact", ex.Message, "OK"); }
    }

    private async void OnCopyIdClicked(object? sender, EventArgs e)
    {
        if ((sender as Button)?.CommandParameter is TrustedContactDto contact)
        {
            await Clipboard.SetTextAsync(contact.Id);
            await DisplayAlertAsync("Invitation ID copied", "Share this ID privately with the invited person. They must sign in with the invited email and accept it.", "OK");
        }
    }

    private async void OnRemoveClicked(object? sender, EventArgs e)
    {
        if ((sender as Button)?.CommandParameter is not TrustedContactDto contact) return;
        try
        {
            await _api.RevokeContactAsync(contact.Id);
            _contacts.Remove(contact);
        }
        catch (Exception ex) { await DisplayAlertAsync("Could not revoke contact", ex.Message, "OK"); }
    }
}



