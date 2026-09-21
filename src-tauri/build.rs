fn main() {
    println!("cargo:rerun-if-changed=src/native_material.m");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        cc::Build::new()
            .file("src/native_material.m")
            .flag("-fobjc-arc")
            .compile("quota_material");
        println!("cargo:rustc-link-lib=framework=AppKit");
    }
    tauri_build::build()
}
