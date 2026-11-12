# Colección Bruno del motor

1. Abre Bruno y selecciona **Open Collection**.
2. Elige esta carpeta `bruno/`.
3. Selecciona el entorno **Local** en la esquina superior derecha.
4. Ejecuta `01 - Iniciar flujo`; la respuesta guarda `instanceId`.
5. Ejecuta `02 - Ver instancia y tareas` y copia el ID de la tarea que quieras
   operar a la variable `taskId` del entorno.

La API debe estar ejecutándose con `npm start`. Para comenzar con datos limpios,
detén el servidor, ejecuta `npm run seed` y vuelve a ejecutar `npm start`.

El seed crea estos usuarios:

| Variable | ID | Rol |
|---|---:|---|
| `adminId` | 1 | admin |
| `managerId` | 2 | gestor |
| `alternateManagerId` | 3 | gestor |
| `bidderId` | 4 | postor |
| `legalId` | 5 | legal |

Las acciones de suspensión, reanudación y cancelación cambian el estado real de
la instancia demo. Cancelar impide continuar ese flujo.
