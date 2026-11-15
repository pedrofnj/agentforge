use std::fs;
use std::path::{Path, PathBuf};

pub fn read_inside(base: &Path, name: &str) -> Option<String> {
    let candidate: PathBuf = base.join(name).canonicalize().ok()?;
    let root = base.canonicalize().ok()?;
    if !candidate.starts_with(&root) {
        return None;
    }
    fs::read_to_string(candidate).ok()
}
