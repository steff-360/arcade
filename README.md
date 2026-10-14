# Pulso Cero

Arcade de supervivencia en navegador hecho con Vite, TypeScript y Phaser 3. Esquiva los núcleos, recoge fragmentos y usa el impulso para resistir cada vez más tiempo. Los fragmentos permiten comprar hasta tres cargas de blindaje para futuras rondas.

## Requisitos

- Node.js 20.19+ o 22.12+
- npm

## Ejecutar

Desde la raíz del proyecto:

```powershell
npm install
npm run dev
```

Abre la dirección local que indique Vite. Para generar y previsualizar una compilación de producción:

```powershell
npm run build
npm run preview
```

## Controles

- `A` / `D` o flechas izquierda/derecha: moverse.
- `Espacio`: impulso con enfriamiento.
- Móvil: toca y arrastra dentro del área de juego.

El récord, los fragmentos y el blindaje se guardan en el almacenamiento local del navegador.
