use std::fs;

pub fn count_errors(path: &str) -> usize {
    let content = fs::read_to_string(path).unwrap_or_default();
    let lines: Vec<&str> = content.lines().collect();
    lines.iter().filter(|l| l.contains("ERROR")).count()
}
