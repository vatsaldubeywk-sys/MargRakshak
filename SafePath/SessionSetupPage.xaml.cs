using System.Collections.ObjectModel;
using System.ComponentModel;
using Microsoft.Extensions.DependencyInjection;
using SafePath.Services;

namespace SafePath;

public sealed class SelectableContact : INotifyPropertyChanged
{
    public string Id { get; init; } = "";
    public string DisplayName { get; init; } = "";
    public string InvitedEmail { get; init; } = "";
    private bool _isSelected;
    public bool IsSelected { get => _isSelected; set { if (_isSelected == value) return; _isSelected = value; PropertyChanged?.Invoke(this, new(nameof(IsSelected))); } }
    public event PropertyChangedEventHandler? PropertyChanged;
}

public partial class SessionSetupPage : ContentPage
{
    private readonly SupabaseFunctionsService _api = MauiProgram.Services.GetRequiredService<SupabaseFunctionsService>();
    private readonly ObservableCollection<SelectableContact> _contacts = new();

    public SessionSetupPage()
    {
        InitializeComponent();
        ContactsList.ItemsSource = _contacts;
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        try
        {
            _contacts.Clear();
            foreach (var contact in await _api.ListContactsAsync())
                if (string.Equals(contact.Status, "accepted", StringComparison.OrdinalIgnoreCase))
                    _contacts.Add(new SelectableContact { Id = contact.Id, DisplayName = contact.DisplayName, InvitedEmail = contact.InvitedEmail });
        }
        catch { _contacts.Clear(); }
    }

    private async void OnStartClicked(object? sender, EventArgs e)
    {
        if (!ConsentCheckBox.IsChecked)
        {
            await DisplayAlertAsync("Please confirm", "Review the location-sharing details and check the consent box.", "OK");
            return;
        }
        var durations = new[] { 30, 60, 120 };
        var minutes = durations[Math.Clamp(DurationPicker.SelectedIndex, 0, durations.Length - 1)];
        var destination = string.IsNullOrWhiteSpace(DestinationEntry.Text) ? null : DestinationEntry.Text.Trim();
        var contactIds = _contacts.Where(c => c.IsSelected).Select(c => c.Id).ToArray();
        if (contactIds.Length == 0)
        {
            await DisplayAlertAsync("Select a trusted contact", "Choose at least one accepted contact so someone can receive a missed-check-in or SOS email when email alerts are configured.", "OK");
            return;
        }
        await Shell.Current.GoToAsync("..");
        if (Shell.Current.CurrentPage is MainPage home)
            await home.StartLocalSessionAsync(minutes, destination, contactIds);
    }
}
