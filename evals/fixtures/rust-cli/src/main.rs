mod files;
mod token;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    files::read_user_file(&args[1]);
}
