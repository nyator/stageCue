# StageCue for Ableton Live: prints this person's Ableton User Library folder.
#
# Run by the Windows installer before it copies the device. Reads the newest
# Live version's Library.cfg (%APPDATA%\Ableton\Live x.y.z\Preferences), the
# same way the StageCue app does (apps/desktop/src/main/ableton-device.ts).
# Prints nothing if Live has never been opened; the installer then uses Live's
# default, Documents\Ableton\User Library.

$ErrorActionPreference = 'SilentlyContinue'

$root = Join-Path $env:APPDATA 'Ableton'
$config = Get-ChildItem -LiteralPath $root -Recurse -Filter 'Library.cfg' |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
if (-not $config) { exit 0 }

[xml]$xml = Get-Content -LiteralPath $config.FullName -Encoding UTF8 -Raw
$project = $xml.Ableton.ContentLibrary.UserLibrary.LibraryProject | Select-Object -First 1
if (-not $project) { exit 0 }

$path = $project.ProjectPath.Value
$name = $project.ProjectName.Value
if (-not $path) { exit 0 }
if (-not $name) { $name = 'User Library' }

[Console]::Out.Write((Join-Path $path $name))
