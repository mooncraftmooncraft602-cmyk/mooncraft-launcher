import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { api } from "@/api";
import { useLauncher } from "@/stores/launcher";
import { useBackendEvents } from "@/hooks/useBackendEvents";
import { checkLauncherUpdate } from "@/utils/selfUpdate";
import { toast, useToasts } from "@/stores/toasts";
import { primeAudio, play } from "@/utils/sounds";
import { TitleBar } from "@/components/TitleBar/TitleBar";
import { Sidebar } from "@/components/Sidebar/Sidebar";
import { StarField } from "@/components/StarField/StarField";
import { Footer } from "@/components/Footer/Footer";
import { Splash } from "@/components/Splash/Splash";
import { ToastContainer } from "@/components/Toast/Toast";
import { Home } from "@/screens/Home/Home";
import { News } from "@/screens/News/News";
import { Settings as SettingsScreen } from "@/screens/Settings/Settings";
import { Account } from "@/screens/Account/Account";
import { Admin } from "@/screens/Admin/Admin";
import { Logs } from "@/screens/Logs/Logs";
import { Auth } from "@/screens/Auth/Auth";
import { PatienceModal } from "@/components/PatienceModal/PatienceModal";
import { ConnectingOverlay } from "@/components/ConnectingOverlay/ConnectingOverlay";

export type Route = "home" | "news" | "settings" | "account" | "logs";

export default function App() {
  useBackendEvents();

  const setAppInfo = useLauncher((s) => s.setAppInfo);
  const setSettings = useLauncher((s) => s.setSettings);
  const setAccounts = useLauncher((s) => s.setAccounts);
  const setServerStatus = useLauncher((s) => s.setServerStatus);
  const setGate = useLauncher((s) => s.setGate);
  const setCheck = useLauncher((s) => s.setCheck);
  const setPhase = useLauncher((s) => s.setPhase);
  const accounts = useLauncher((s) => s.accounts);

  const [route, setRouteState] = useState<Route>("home");
  const [adminOpen, setAdminOpen] = useState(false);
  const [splashDone, setSplashDone] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);

  // Prime AudioContext + light SFX on every navigation.
  const setRoute = (r: Route) => {
    primeAudio();
    play("click");
    setRouteState(r);
  };

  useEffect(() => {
    (async () => {
      // 0. Auto-update du launcher lui-même (avant tout le reste).
      //    Si une mise à jour est installée, l'app redémarre → on s'arrête là.
      let updToastId: number | null = null;
      const installed = await checkLauncherUpdate({
        onAvailable: (v) => {
          updToastId = useToasts.getState().push({
            kind: "info",
            title: "Mise à jour du launcher",
            body: `Version ${v} — téléchargement…`,
            duration: 0,
          });
        },
        onInstalling: () => toast.success("Mise à jour prête", "Redémarrage…"),
        onError: (e) => {
          if (updToastId) useToasts.getState().dismiss(updToastId);
          console.error("self-update failed", e);
        },
      });
      if (installed) return; // le process va redémarrer sur la nouvelle version

      try {
        const [info, settings, accounts] = await Promise.all([
          api.appInfo(),
          api.getSettings(),
          api.listAccounts(),
        ]);
        setAppInfo(info);
        setSettings(settings);
        setAccounts(accounts);
      } catch (e) {
        console.error("bootstrap failed", e);
      } finally {
        setBootstrapped(true);
      }

      api.getServerStatus().then(setServerStatus).catch(() => {});
      api.getServerGate().then(setGate).catch(() => setGate({ open: true }));
      setPhase("checking");
      try {
        const c = await api.checkUpdate();
        setCheck(c);
        setPhase("ready");
      } catch (e) {
        console.error("update check failed", e);
        setPhase("ready");
      }
    })();
  }, [setAppInfo, setSettings, setAccounts, setServerStatus, setGate, setCheck, setPhase]);

  // Auth gate: until at least one pilote exists, block the rest of the UI.
  const needsAuth = bootstrapped && accounts.length === 0;

  return (
    <>
      {!splashDone && <Splash onComplete={() => setSplashDone(true)} />}
      {splashDone && needsAuth && (
        <Auth onAuthed={() => { /* accounts state already updated */ }} />
      )}
      <div className="app-shell" onClick={primeAudio}>
        <StarField />
        <div className="aurora aurora--violet" />
        <div className="aurora aurora--cyan" />
        <TitleBar />
        <div className="app-body">
          <Sidebar
            current={route}
            onNavigate={setRoute}
            onAdminOpen={() => { setAdminOpen(true); play("open"); }}
          />
          <main className="app-main">
            <AnimatePresence mode="wait">
              <motion.div
                key={route}
                className="route-frame"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              >
                {route === "home" && <Home />}
                {route === "news" && <News />}
                {route === "settings" && <SettingsScreen />}
                {route === "account" && <Account />}
                {route === "logs" && <Logs />}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
        <Footer onOpenLogs={() => setRoute("logs")} />
        <AnimatePresence>
          {adminOpen && <Admin onClose={() => setAdminOpen(false)} />}
        </AnimatePresence>
        <ToastContainer />
        <PatienceModal />
      </div>
      <ConnectingOverlay />
    </>
  );
}
