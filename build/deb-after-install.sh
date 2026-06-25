#!/bin/bash
# Custom postinst (electron-builder deb.afterInstall). Mirrors electron-builder's
# default script, EXCEPT chrome-sandbox is always given the SUID bit (4755).
#
# Why: on Ubuntu 24.04+ AppArmor restricts unprivileged user namespaces
# (kernel.apparmor_restrict_unprivileged_userns=1). The stock postinst probes
# `unshare --user`, which succeeds from the install shell and selects mode 0755 —
# but the AppArmor-confined Electron binary can't use the userns sandbox at
# runtime and falls back to the SUID sandbox, which then fails on 0755. Forcing
# 4755 makes the SUID sandbox always available.

if type update-alternatives 2>/dev/null >&1; then
    # Remove previous link if it doesn't use update-alternatives
    if [ -L '/usr/bin/tractodb' -a -e '/usr/bin/tractodb' -a "`readlink '/usr/bin/tractodb'`" != '/etc/alternatives/tractodb' ]; then
        rm -f '/usr/bin/tractodb'
    fi
    update-alternatives --install '/usr/bin/tractodb' 'tractodb' '/opt/TractoDB/tractodb' 100 || ln -sf '/opt/TractoDB/tractodb' '/usr/bin/tractodb'
else
    ln -sf '/opt/TractoDB/tractodb' '/usr/bin/tractodb'
fi

# Always use the SUID sandbox — see comment above.
chmod 4755 '/opt/TractoDB/chrome-sandbox' || true

if hash update-mime-database 2>/dev/null; then
    update-mime-database /usr/share/mime || true
fi

if hash update-desktop-database 2>/dev/null; then
    update-desktop-database /usr/share/applications || true
fi
