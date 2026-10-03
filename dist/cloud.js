'use strict';
// Optional cloud connection. The local running coach works without this service.
(async function () {
  const el = id => document.getElementById(id);
  const status = text => { el('cloudStatus').textContent = text; };
  const config = window.RUN_CLOUD_CONFIG || {};
  if (!config.url || !config.publishableKey) {
    status('Cloud setup is pending. Your journal is still saved on this device.');
    return;
  }
  let client, user = null, enabled = false, busy = false, queued = false;
  const ownerKey = 'runcompanion.cloud.owner.v1';
  const consentKey = 'runcompanion.cloud.enabled.v1';
  function deadline(promise, message) {
    let timer;
    return Promise.race([promise, new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error(message)), 15000);
    })]).finally(() => clearTimeout(timer));
  }
  function accountUI() {
    el('cloudLogin').hidden = !!user;
    el('cloudAccount').hidden = !user;
    el('cloudEmailLabel').textContent = user ? user.email : '';
    el('cloudEnable').hidden = enabled;
    el('cloudSync').hidden = !enabled;
  }
  async function sync() {
    if (!user || !enabled) return;
    if (busy) { queued = true; return; }
    const account = user.id;
    busy = true; status('Syncing your private journal…');
    try {
      const local = window.RunJournalCloud.exportRecords();
      const rows = local.map(r => ({user_id: account, record_id: r.record_id, kind: r.kind, payload: r.payload}));
      for (let i = 0; i < rows.length; i += 25) {
        if (user?.id !== account || !enabled) return;
        const result = await client.from('run_records').upsert(rows.slice(i, i + 25), {onConflict:'user_id,record_id', ignoreDuplicates:true});
        if (result.error) throw result.error;
      }
      const remote = [];
      for (let offset = 0; ; offset += 500) {
        if (user?.id !== account || !enabled) return;
        const result = await client.from('run_records').select('record_id,kind,payload').eq('user_id', account).order('record_id').range(offset, offset + 499);
        if (result.error) throw result.error;
        remote.push(...result.data);
        if (result.data.length < 500) break;
      }
      if (user?.id !== account || !enabled) return;
      window.RunJournalCloud.mergeRecords(remote);
      status(`Synced at ${new Date().toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}. Your completed activities are available on your other devices.`);
    } catch (error) {
      // Keep the journal intact when the network or service is unavailable.
      status(`Sync did not finish. Your local journal is safe. ${error.message || 'Check your connection and try Sync now.'}`);
    } finally {
      busy = false;
      if (queued) { queued = false; void sync(); }
    }
  }
  try {
    const url = new URL(config.url);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co') || config.publishableKey.startsWith('sb_secret_')) throw new Error('Use the HTTPS Supabase Project URL and public publishable key.');
    status('Loading cloud sign-in…');
    await deadline(new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'vendor/supabase-2.57.4.js';
      script.onload = resolve; script.onerror = () => reject(new Error('Cloud sign-in could not load. Check your connection and reload.'));
      document.head.append(script);
    }), 'Cloud sign-in took too long to load. Reload the page to retry.');
    client = window.supabase.createClient(config.url, config.publishableKey);
    const applySession = session => {
      user = session?.user || null;
      const owner = localStorage.getItem(ownerKey);
      enabled = !!user && owner === user.id && localStorage.getItem(consentKey) === user.id;
      accountUI();
      status(user ? (owner && owner !== user.id ? 'This browser journal belongs to another account. Use a separate browser profile to keep accounts apart.' : enabled ? 'Signed in. Your journal will sync.' : 'Enable sync to upload this device’s completed activities to your private account.') : 'Sign in with your Run Companion account to sync across devices.');
      // Run outside the auth callback so SDK auth locks can be released first.
      if (enabled) setTimeout(() => { void sync(); }, 0);
    };
    status('Checking your sign-in…');
    const {data, error} = await deadline(client.auth.getSession(), 'Sign-in did not respond. Reload the page to retry.');
    if (error) throw error;
    applySession(data.session);
    client.auth.onAuthStateChange((event, session) => { if (['SIGNED_IN','SIGNED_OUT','INITIAL_SESSION'].includes(event)) applySession(session); });
    el('cloudLogin').hidden = !!user;
    el('cloudLogin').onsubmit = async event => {
      event.preventDefault(); el('cloudSignIn').disabled = true; status('Signing in…');
      try {
        const result = await client.auth.signInWithPassword({email:el('cloudEmail').value.trim(), password:el('cloudPassword').value});
        if (result.error) throw result.error;
        el('cloudPassword').value = ''; applySession(result.data.session);
      } catch (error) { status(`Sign-in failed. ${error.message}`); }
      finally { el('cloudSignIn').disabled = false; }
    };
    el('cloudEnable').onclick = () => {
      if (!user) return;
      const owner = localStorage.getItem(ownerKey);
      if (owner && owner !== user.id) { status('Use a separate browser profile for this account. This journal is already linked to another account.'); return; }
      try { localStorage.setItem(ownerKey, user.id); localStorage.setItem(consentKey, user.id); enabled = true; accountUI(); void sync(); }
      catch { status('This browser cannot save cloud settings. Enable browser storage and try again.'); }
    };
    el('cloudSync').onclick = () => { void sync(); };
    el('cloudSignOut').onclick = async () => {
      enabled = false;
      const result = await client.auth.signOut({scope:'local'});
      if (result.error) { status(`Sign-out failed. ${result.error.message}`); return; }
      applySession(null); status('Signed out. Your journal remains on this device.');
    };
    window.addEventListener('run-journal-changed', () => { void sync(); });
    window.addEventListener('online', () => { void sync(); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void sync(); });
  } catch (error) { status(`Cloud is unavailable. ${error.message} Your local running coach still works.`); }
})();
