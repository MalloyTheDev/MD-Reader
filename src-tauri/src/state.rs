// Shared backend state: the current library root and the set of folders the user has explicitly
// authorized as roots (via the picker dialog, the vault, a file-association open, or restoring the
// persisted lastFolder). Mirrors the libraryRoot + authorizedRoots model in src/main/ipc.ts.
//
// Confinement checks are only meaningful if the renderer cannot silently widen the root to
// anywhere on disk, so list_markdown / read_all gate on authorization and every file command
// gates on is_inside(root, candidate).

use crate::paths::{is_inside, normalize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

#[derive(Default)]
pub struct AppState {
    inner: Mutex<Inner>,
}

#[derive(Default)]
struct Inner {
    library_root: Option<PathBuf>,
    authorized_roots: HashSet<PathBuf>,
    // A .md path passed on the command line (file association / second-instance) that the renderer
    // has not yet picked up via get_pending_open_path. Mirrors pendingOpenPath in index.ts.
    pending_open: Option<PathBuf>,
}

impl AppState {
    pub fn authorize_root(&self, p: &Path) {
        let mut g = self.inner.lock().unwrap();
        g.authorized_roots.insert(normalize(p));
    }

    pub fn is_authorized(&self, p: &Path) -> bool {
        let g = self.inner.lock().unwrap();
        g.authorized_roots.contains(&normalize(p))
    }

    pub fn set_library_root(&self, p: &Path) {
        let mut g = self.inner.lock().unwrap();
        g.library_root = Some(normalize(p));
    }

    pub fn library_root(&self) -> Option<PathBuf> {
        self.inner.lock().unwrap().library_root.clone()
    }

    /// True if `candidate` is within the current library root. False if no root is open - matching
    /// the Electron guard `!libraryRoot || !isInsideRoot(abs)`.
    pub fn is_inside_root(&self, candidate: &Path) -> bool {
        match self.library_root() {
            Some(root) => is_inside(&root, candidate),
            None => false,
        }
    }

    /// Record a pending file-open (and authorize its folder so the renderer can list it).
    pub fn set_pending_open(&self, p: &Path) {
        let mut g = self.inner.lock().unwrap();
        if let Some(dir) = p.parent() {
            g.authorized_roots.insert(normalize(dir));
        }
        g.pending_open = Some(p.to_path_buf());
    }

    /// Take the pending file-open (one-shot: clears it). Authorizes the folder again in case the
    /// pending path was set before this state existed.
    pub fn take_pending_open(&self) -> Option<PathBuf> {
        let mut g = self.inner.lock().unwrap();
        let p = g.pending_open.take();
        if let Some(ref path) = p {
            if let Some(dir) = path.parent() {
                g.authorized_roots.insert(normalize(dir));
            }
        }
        p
    }
}
