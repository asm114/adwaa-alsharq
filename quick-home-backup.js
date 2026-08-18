(()=>{
'use strict';
if(window.__adwaaQuickHomeBackupInstalled)return;
window.__adwaaQuickHomeBackupInstalled=true;

// The command-center header is reserved for today's operational controls.
// Full backup controls remain in the data-protection and about views.
document.getElementById('quickHomeBackupButton')?.remove();
})();
