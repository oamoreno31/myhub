import {
  ArrowLeftRightIcon,
  CalendarCheckIcon,
  ChartColumnIcon,
  CreditCardIcon,
  HeartPulseIcon,
  HistoryIcon,
  HouseIcon,
  HandCoinsIcon,
  type LucideIcon,
  PieChartIcon,
  SettingsIcon,
} from "lucide-react";

export type ItemNavegacion = {
  href: string;
  etiqueta: string;
  icono: LucideIcon;
  /** Fase del plan en la que se construye la pantalla (docs/06). */
  fase: number;
  /** Aparece directamente en la barra inferior del móvil. */
  enBarraMovil?: boolean;
};

export const NAVEGACION: ItemNavegacion[] = [
  { href: "/", etiqueta: "Inicio", icono: HouseIcon, fase: 1, enBarraMovil: true },
  { href: "/mes", etiqueta: "Mes actual", icono: CalendarCheckIcon, fase: 1, enBarraMovil: true },
  { href: "/movimientos", etiqueta: "Movimientos", icono: ArrowLeftRightIcon, fase: 1 },
  { href: "/tarjetas", etiqueta: "Tarjetas de crédito", icono: CreditCardIcon, fase: 2, enBarraMovil: true },
  { href: "/deudas", etiqueta: "Deudas y préstamos", icono: HandCoinsIcon, fase: 3 },
  { href: "/analisis", etiqueta: "Análisis", icono: ChartColumnIcon, fase: 4 },
  { href: "/presupuesto", etiqueta: "Presupuesto", icono: PieChartIcon, fase: 4 },
  { href: "/salud", etiqueta: "Salud financiera", icono: HeartPulseIcon, fase: 5 },
  { href: "/historico", etiqueta: "Histórico", icono: HistoryIcon, fase: 4 },
  { href: "/configuracion", etiqueta: "Configuración", icono: SettingsIcon, fase: 1 },
];

/** Un ítem está activo si la ruta coincide o es una subruta (salvo Inicio, que es exacto). */
export function estaActivo(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
