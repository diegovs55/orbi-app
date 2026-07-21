# DEU-G2-ROAD-DISTANCE — Distancia vial para negocios cerca del umbral

**Estado:** Deuda técnica registrada — no implementar en MVP  
**Afecta:** G2 (Descubrimiento territorial)  
**Prioridad:** Post-MVP, evaluar con evidencia operativa

---

## Problema

En G2 MVP, `distanceKm` es Haversine (línea recta entre el negocio y el centro de la órbita).
Haversine subestima la distancia real de traslado. La diferencia puede ser significativa:

**Ejemplo observado (2026-07-21):**
- Regina Café MX → centro geocodificado de Tenancingo: ~10 km en línea recta
- Ruta observada en Apple Maps desde la misma ubicación: ~18 km / 27 min por carretera
- Razón: orografía y red vial de la región (curvas, subidas, desvíos)

El filtro de radio ordinario (`radioOrdinarioPorSector`) usa esta distancia, por lo que un negocio
a 9.8 km en línea recta (dentro del límite) puede requerir 18 km por carretera.

---

## Restricciones actuales (G2 MVP)

- Haversine se usa **únicamente** para descubrimiento, prefiltro y ordenamiento.
- La UI muestra "**aprox.** X km de la zona de búsqueda" — no afirma distancia vial.
- No se muestra tiempo estimado.
- G1 conserva su métrica autoritativa vigente para precio y cobertura de radio de servicio.

---

## Estrategia futura en dos etapas

### Etapa 1 — Haversine como prefiltro (ya implementado)

```
candidatos = negocios con Haversine(negocio → orbitCenter) ≤ radioOrdinario
```

Rápido, sin costo de API, sin latencia de red. Puede incluir falsos positivos (negocios
que están cerca en línea recta pero lejos por carretera).

### Etapa 2 — Distancia vial para candidatos cercanos al umbral

Ejecutar una consulta de distancia vial (OSRM, Google Routes API, u otro motor) **solo para**:
- Los primeros N resultados (ej. top 5–10 tras el prefiltro), o
- Los negocios cuya distancia Haversine esté entre el 70 % y el 110 % del radio ordinario
  (zona de incertidumbre real).

```
umbral_inferior = radioOrdinario * 0.70
umbral_superior = radioOrdinario * 1.10

si Haversine < umbral_inferior → incluir sin verificación vial
si Haversine > umbral_superior → excluir sin verificación vial
si umbral_inferior ≤ Haversine ≤ umbral_superior → consultar distancia vial
```

**No consultar rutas para todo el catálogo de forma indiscriminada.**

---

## Condiciones para evaluar implementación

1. Evidencia de que falsos positivos afectan la experiencia del usuario en producción.
2. Volumen de consultas que justifique el costo de una API de ruteo.
3. Análisis de latencia aceptable para el flujo de descubrimiento.

---

## Referencias

- `lib/discovery.ts` — `haversineKm()` y `DISCOVERY.radioOrdinarioPorSector`
- `lib/catalog.ts` — tipo `CatalogTerritorialResult`, campo `distanceKm`
- `components/ServiceRequestFlow.tsx` — texto UI: "aprox. X km de la zona de búsqueda"
- `docs/ORBI_GEO_CONTRACT.md` — contrato geográfico vigente
