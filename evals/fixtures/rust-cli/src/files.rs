use std::fs;

pub fn read_user_file(name: &str) -> String {
    let path = format!("/srv/data/{}", name);
    fs::read_to_string(path).unwrap_or_default()
}
