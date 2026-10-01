/** Valores sugeridos del asistente inicial (doc 01 §5). Todo es editable después. */

export type CuentaSugerida = {
  clave: string;
  nombre: string;
  tipo: "ahorros" | "corriente" | "billetera";
  entidad?: string;
};

export const CUENTAS_SUGERIDAS: CuentaSugerida[] = [
  { clave: "ahorros", nombre: "Ahorros", tipo: "ahorros" },
  { clave: "corriente", nombre: "Corriente", tipo: "corriente" },
  { clave: "nequi", nombre: "Nequi", tipo: "billetera", entidad: "Nequi" },
  { clave: "daviplata", nombre: "Daviplata", tipo: "billetera", entidad: "Daviplata" },
];

export type ObligacionSugerida = {
  clave: string;
  nombre: string;
  categoria: string;
  tipo: "arriendo" | "servicio" | "telecom" | "seguridad_social" | "cooperativa";
  variable: boolean;
  frecuencia: "mensual" | "bimestral";
  dia: number;
  ayuda: string;
};

export const OBLIGACIONES_SUGERIDAS: ObligacionSugerida[] = [
  {
    clave: "arriendo",
    nombre: "Arriendo",
    categoria: "Arriendo",
    tipo: "arriendo",
    variable: false,
    frecuencia: "mensual",
    dia: 5,
    ayuda: "Valor fijo mensual",
  },
  {
    clave: "energia",
    nombre: "Energía (luz)",
    categoria: "Energía (luz)",
    tipo: "servicio",
    variable: true,
    frecuencia: "mensual",
    dia: 15,
    ayuda: "Variable: se estima con el promedio",
  },
  {
    clave: "agua",
    nombre: "Agua",
    categoria: "Agua",
    tipo: "servicio",
    variable: true,
    frecuencia: "bimestral",
    dia: 18,
    ayuda: "En Bogotá suele ser bimestral",
  },
  {
    clave: "gas",
    nombre: "Gas",
    categoria: "Gas",
    tipo: "servicio",
    variable: true,
    frecuencia: "mensual",
    dia: 20,
    ayuda: "Variable",
  },
  {
    clave: "internet",
    nombre: "Internet",
    categoria: "Internet",
    tipo: "telecom",
    variable: false,
    frecuencia: "mensual",
    dia: 20,
    ayuda: "Fijo",
  },
  {
    clave: "celular",
    nombre: "Plan de celular",
    categoria: "Plan de celular",
    tipo: "telecom",
    variable: false,
    frecuencia: "mensual",
    dia: 22,
    ayuda: "Fijo",
  },
  {
    clave: "pila",
    nombre: "Seguridad social (PILA)",
    categoria: "Seguridad social (PILA)",
    tipo: "seguridad_social",
    variable: true,
    frecuencia: "mensual",
    dia: 10,
    ayuda: "Salud, pensión y ARL",
  },
  {
    clave: "cooperativa",
    nombre: "Cooperativa",
    categoria: "Cooperativas",
    tipo: "cooperativa",
    variable: false,
    frecuencia: "mensual",
    dia: 26,
    ayuda: "Aporte + cuota",
  },
];
