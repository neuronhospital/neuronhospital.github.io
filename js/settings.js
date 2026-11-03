(() => {
  'use strict';

  const auth = window.NeuronAuth;
  const session = auth?.get?.();
  const identity = document.getElementById('settingsIdentity');
  identity.textContent = session
    ? `${session.username} · ${session.admin ? 'Admin' : session.city}`
    : 'No active account session';

  // Safari private browsing and browser storage policies can make Web Storage unavailable.
  // Preferences are optional; a storage failure must not disable account/settings controls.
  const storage = {
    get(key) {
      try { return window.localStorage.getItem(key); } catch (_) { return null; }
    },
    set(key, value) {
      try { window.localStorage.setItem(key, value); return true; } catch (_) { return false; }
    }
  };

  const keys = ['opd', 'eeg', 'update', 'refund', 'prebooking', 'eeg_calls', 'amb_eeg_calls'];
  const labels = {
    opd: 'OPD notifications',
    eeg: 'EEG notifications',
    update: 'Patient update notifications',
    refund: 'Refund notifications',
    prebooking: 'PreBooking notifications',
    eeg_calls: 'Latur EEG Calls notifications',
    amb_eeg_calls: 'Ambajogai EEG Calls notifications'
  };
  const prefs = document.getElementById('notificationPrefs');
  const read = key => storage.get(`neuron_web_notification_${key}`) === '1';

  keys.forEach(key => {
    if ((key === 'eeg_calls' || key === 'amb_eeg_calls') && !auth?.canAccessEEGCalls?.()) return;
    const label = document.createElement('label');
    label.style.cssText = 'display:flex;align-items:center;gap:9px';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = read(key);
    input.style.cssText = 'width:auto;min-height:0';
    input.addEventListener('change', () => {
      const saved = storage.set(`neuron_web_notification_${key}`, input.checked ? '1' : '0');
      document.getElementById('prefStatus').textContent = saved
        ? 'Saved locally. Browser push delivery is not configured by this preference.'
        : 'This browser blocked local storage. The preference applies only until this page is closed.';
    });
    label.append(input, document.createTextNode(labels[key]));
    prefs.append(label);
  });

  const sound = document.getElementById('soundPref');
  sound.checked = storage.get('neuron_web_sound_open') === '1';
  sound.addEventListener('change', () => {
    const saved = storage.set('neuron_web_sound_open', sound.checked ? '1' : '0');
    document.getElementById('prefStatus').textContent = saved
      ? 'Sound preference saved on this browser.'
      : 'This browser blocked local storage. The preference applies only until this page is closed.';
  });

  document.getElementById('settingsLogout').addEventListener('click', () => {
    auth?.clear?.();
    location.href = 'index.html';
  });

  document.getElementById('locationCheck').addEventListener('click', () => {
    const out = document.getElementById('locationStatus');
    if (!navigator.geolocation) {
      out.textContent = 'Geolocation is not supported by this browser. You can continue without it.';
      return;
    }
    out.textContent = 'Requesting browser location permission…';
    navigator.geolocation.getCurrentPosition(
      () => {
        out.textContent = 'Location permission is granted and a position is available. This check did not resolve a city or save coordinates.';
      },
      error => {
        out.textContent = error.code === 1
          ? 'Location permission was denied. You can continue without it.'
          : error.code === 2
            ? 'Location is currently unavailable. You can continue without it.'
            : 'Location request timed out. You can continue without it.';
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 900000 }
    );
  });
})();
