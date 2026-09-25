/**
 * Categoria de grupo = slug do link de divulgação. "geral" atende /grupos;
 * as demais atendem /grupos/<categoria> (ex.: sex-shop).
 */
export const DEFAULT_CATEGORY = 'geral';

/** Letras minúsculas, números e hífens (ex.: sex-shop). */
export const CATEGORY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const CATEGORY_MAX_LENGTH = 40;
export const CATEGORY_MESSAGE =
  'categoria deve ter só letras minúsculas, números e hífens (ex.: sex-shop)';
