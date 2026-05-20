use std::fs;
use std::path::{Path, PathBuf};

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct ScannedFile {
  pub abs_path: String,
  pub rel_path: String,
  pub name: String,
  pub size: u64,
}

fn walk_dir_collect_files(dir: &Path, out: &mut Vec<PathBuf>) {
  let read_dir = match fs::read_dir(dir) {
    Ok(rd) => rd,
    Err(_) => return,
  };

  for entry in read_dir.flatten() {
    let path = entry.path();

    let ft = match entry.file_type() {
      Ok(t) => t,
      Err(_) => continue,
    };

    // skip symlinks to avoid cycles
    if ft.is_symlink() {
      continue;
    }

    if ft.is_dir() {
      walk_dir_collect_files(&path, out);
    } else if ft.is_file() {
      out.push(path);
    }
  }
}

fn root_label_for_drop(p: &Path) -> String {
  p.file_name()
    .and_then(|s| s.to_str())
    .unwrap_or("dropped")
    .to_string()
}

#[tauri::command]
pub fn scan_paths(paths: Vec<String>) -> Result<Vec<ScannedFile>, String> {
  let mut results: Vec<ScannedFile> = Vec::new();

  for raw in paths {
    let p = PathBuf::from(&raw);
    if !p.exists() {
      continue;
    }

    let meta = fs::metadata(&p).map_err(|e| e.to_string())?;
    if meta.is_dir() {
      let root = root_label_for_drop(&p);
      let mut files: Vec<PathBuf> = Vec::new();
      walk_dir_collect_files(&p, &mut files);

      for f in files {
        let fmeta = match fs::metadata(&f) {
          Ok(m) => m,
          Err(_) => continue,
        };

        let size = fmeta.len();
        let name = f.file_name().and_then(|s| s.to_str()).unwrap_or("").to_string();

        let rel = match f.strip_prefix(&p) {
          Ok(rp) => format!("{}/{}", root, rp.to_string_lossy().replace('\\', "/")),
          Err(_) => format!("{}/{}", root, name),
        };

        results.push(ScannedFile {
          abs_path: f.to_string_lossy().to_string(),
          rel_path: rel,
          name,
          size,
        });
      }
    } else if meta.is_file() {
      let size = meta.len();
      let name = p.file_name().and_then(|s| s.to_str()).unwrap_or("").to_string();

      results.push(ScannedFile {
        abs_path: p.to_string_lossy().to_string(),
        rel_path: name.clone(),
        name,
        size,
      });
    }
  }

  Ok(results)
}

#[tauri::command]
pub fn read_text(path: String) -> Result<String, String> {
  let bytes = fs::read(&path).map_err(|e| e.to_string())?;
  Ok(String::from_utf8_lossy(&bytes).to_string())
}