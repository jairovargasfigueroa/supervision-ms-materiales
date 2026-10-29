/** Tipos de material del catálogo (003, criterio 3). */
export const TIPOS_MATERIAL = [
  'CEMENTO',
  'ACERO',
  'AGREGADO',
  'LADRILLO',
  'MADERA',
  'ELECTRICO',
  'SANITARIO',
  'PINTURA',
  'OTRO',
] as const;

export type TipoMaterial = (typeof TIPOS_MATERIAL)[number];
