//! NeoForge loader support.
//!
//! Unlike Fabric (a flat library list + main class), NeoForge 1.20.2+ uses the
//! Java module system (`cpw.mods.bootstraplauncher.BootstrapLauncher`) and ships
//! install *processors*. Reimplementing that pipeline by hand is brittle, so we
//! run the **official NeoForge installer headlessly** (`--installClient`) which
//! downloads every library and runs the processors, then we read the generated
//! `versions/neoforge-<ver>/neoforge-<ver>.json` to build the launch command.
//!
//! The produced version JSON `inheritsFrom`s the vanilla one; we merge its
//! `arguments.jvm` / `arguments.game` / `mainClass` with the vanilla install
//! that the launcher already prepared.

mod installer;

pub use installer::{install, NeoForgeProfile};
