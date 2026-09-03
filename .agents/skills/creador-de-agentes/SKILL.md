---
name: creador-de-agentes
description: >-
  Habilidad para crear Agentes Personalizados (Custom Agents) en Antigravity basándose en las convenciones del artículo "Introducing Custom Agents".
---

# Creador de Agentes

Esta habilidad te permite crear y configurar Agentes Personalizados (Custom Agents) en Antigravity. Los agentes personalizados son configuraciones basadas en archivos que definen un rol específico con instrucciones, herramientas y restricciones propias.

## Ubicación de los archivos
- **Específicos del proyecto/espacio de trabajo**: Se deben guardar en `.agents/agents/<nombre-del-agente>.md` en la raíz del proyecto.
- **Globales (a nivel de usuario)**: Se deben guardar en `~/.gemini/config/agents/<nombre-del-agente>.md`.

## Formato del Archivo
Los agentes personalizados utilizan un formato de archivo Markdown que contiene un encabezado *frontmatter* en YAML.
El *frontmatter* indica cómo configurar y ejecutar el agente, y el cuerpo del markdown se compila directamente como el *system prompt* del agente.

## Plantilla Básica (Blueprint)

```markdown
---
name: nombre-del-agente
description: Descripción de lo que hace el agente.
model: flash
mainAgent: true
subagent: true
permissionMode: acceptEdits
commandExecutionPolicy: auto
tools:
  - view_file
  - replace_file_content
  - manage_task
  - run_command
skills:
  - skills/alguna-habilidad-especifica
---
# Instrucciones Principales (Core Instructions)
Eres un agente especializado en... [Aquí van las instrucciones del sistema, reglas y lineamientos específicos para el agente].
```

## Propiedades Clave del Frontmatter

- `mainAgent: true` : Permite seleccionar y ejecutar el agente directamente como agente principal desde la interfaz de Antigravity 2.0 o CLI (`agy --agent <name>`).
- `subagent: true` : Permite que el agente pueda ser llamado dinámicamente como una herramienta (subagente) por un agente coordinador.
- `permissionMode: acceptEdits` (opcional): Define niveles básicos de permisos de seguridad.
- `commandExecutionPolicy: auto` (opcional): Permite al agente ejecutar comandos estándar de compilación o testing en segundo plano de forma autónoma. Los comandos de alto riesgo seguirán requiriendo aprobación manual.
- `tools` (opcional): Define el subconjunto exacto de herramientas disponibles para el agente, evitando la sobrecarga de contexto.
- `skills` (opcional): Define las habilidades específicas (skills) que el agente tendrá a su disposición.
- `model` (opcional): Especifica el modelo a utilizar (por ejemplo, `flash`).

Cuando el usuario te pida crear un agente personalizado, utiliza este conocimiento para generar el archivo Markdown correspondiente con su *frontmatter* YAML y colócalo en el directorio correcto.
