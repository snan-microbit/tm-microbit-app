/**
 * regenerator-guard.js
 *
 * TF.js incluye regenerator-runtime, que asigna su runtime a la variable
 * global `regeneratorRuntime`. Como el bundle corre en modo estricto y la
 * variable no está declarada, la asignación lanza ReferenceError y el
 * fallback usa Function("...") — equivalente a eval — que la CSP bloquea.
 *
 * Declarando la propiedad de antemano, la asignación directa funciona y
 * el fallback nunca se ejecuta. Esto permite mantener script-src sin
 * 'unsafe-eval'.
 *
 * IMPORTANTE: debe ser un script clásico (sin type="module") y cargarse
 * ANTES de tfjs. Los módulos ES se difieren y correrían demasiado tarde.
 */
window.regeneratorRuntime = undefined;