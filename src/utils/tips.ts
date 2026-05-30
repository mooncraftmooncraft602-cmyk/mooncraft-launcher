/** Spatial / Minecraft tips that rotate on the Home screen during updates. */
export const SPATIAL_TIPS: string[] = [
  "La Lune s'éloigne de la Terre de 3,8 cm par an.",
  "Sur la Lune, ton poids est divisé par 6. Tes hauteurs de saut, multipliées.",
  "Un jour lunaire dure environ 29,5 jours terrestres.",
  "Les empreintes d'Apollo 11 sont toujours là — pas de vent pour les effacer.",
  "Un voyage Terre-Mars prend entre 6 et 9 mois selon l'alignement.",
  "Le Soleil tourne aussi sur lui-même. Un tour : 25 jours à l'équateur.",
  "La galaxie d'Andromède fonce sur la nôtre à 110 km/s.",
  "Il existe des « lunes de lune » : des satellites en orbite autour d'autres lunes.",
  "À l'échelle de l'Univers observable, notre galaxie est un grain de sable.",
  "Le Voyager 1 a quitté l'héliosphère en 2012. Il est toujours en vol.",
];

export const SERVER_TIPS: string[] = [
  "Astuce : tape /spawn pour rentrer chez toi.",
  "Astuce : /home <nom> pour téléporter à un point sauvegardé.",
  "Le shop est accessible avec /shop ou via les PNJ marchands.",
  "N'oublie pas de voter chaque jour — récompenses dans /vote.",
  "Le serveur tourne en Fabric 1.21.11.",
  "Le Discord officiel a un salon #aide si tu coinces.",
  "Touche F3 + B pour afficher les hitboxes en jeu.",
  "Touche F1 pour cacher l'UI le temps d'une jolie capture.",
  "Le claim te protège contre le grief : /claim help.",
  "Les codes promo de la boutique passent par /redeem <code>.",
];

export const ALL_TIPS = [...SPATIAL_TIPS, ...SERVER_TIPS];

/** Pseudo-random pick stable for `n` rotations per second from now. */
export function pickTip(seed: number, source = ALL_TIPS): string {
  if (source.length === 0) return "";
  const i = Math.abs(Math.floor(seed)) % source.length;
  return source[i];
}
