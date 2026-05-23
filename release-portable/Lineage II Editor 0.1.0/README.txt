Lineage II Editor 0.1.0 (portable)
==================================

Just run "lineage2_editor.exe". No installation required.

Tested against:
  Client      Superion, protocol revision 502
  Server      L2J Mobius Superion

Requirements
------------
  Windows 10 (1803+) or Windows 11. The WebView2 runtime is pre-installed
  on these versions. If you are on an older Windows, install WebView2 from
  https://developer.microsoft.com/microsoft-edge/webview2/

First-run notes
---------------
  Windows SmartScreen may warn "Windows protected your PC" because this
  binary is unsigned. Click "More info" then "Run anyway". The warning goes
  away as the download accumulates reputation, or sooner if the project
  ever code-signs releases.

  On first launch, open Settings and point the editor at:
    - your L2 client folder (containing system\L2.exe)
    - your server data folder (data\)

  Then open the World tab to start exploring.

Settings, caches, and texture extracts live under:
  %APPDATA%\com.rumdum.lineage2_editor\

Uninstalling
------------
  Delete this folder. If you also want your settings and caches gone,
  delete the %APPDATA% folder above.

Source code, issues, contributing
---------------------------------
  https://github.com/<your-user>/lineage2_editor

License
-------
  Released under GNU General Public License v3.0. See the LICENSE file
  in this folder for the full text.
