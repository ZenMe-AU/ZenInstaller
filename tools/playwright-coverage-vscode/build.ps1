$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$extensionRoot = $PSScriptRoot
$outputDirectory = Join-Path $extensionRoot 'dist'
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
$archivePath = Join-Path $outputDirectory 'zeninstaller-playwright-coverage-0.1.1.vsix'
# Overwrite only this generated archive; never recursively remove a directory.
if (Test-Path -LiteralPath $archivePath) { Remove-Item -LiteralPath $archivePath }
$archive = [System.IO.Compression.ZipFile]::Open($archivePath, 'Create')
try {
    foreach ($name in @('package.json', 'extension.cjs', 'coverage.cjs', 'README.md')) {
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, (Join-Path $extensionRoot $name), "extension/$name") | Out-Null
    }
    $metadata = @{
        '[Content_Types].xml' = '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="json" ContentType="application/json"/><Default Extension="cjs" ContentType="application/javascript"/><Default Extension="md" ContentType="text/markdown"/><Default Extension="vsixmanifest" ContentType="text/xml"/></Types>'
        'extension.vsixmanifest' = '<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011"><Metadata><Identity Language="en-US" Id="zeninstaller-playwright-coverage" Version="0.1.1" Publisher="zeninstaller"/><DisplayName>ZenInstaller Playwright Coverage</DisplayName><Description xml:space="preserve">Display Playwright Istanbul coverage in VS Code.</Description><Tags>testing,coverage</Tags><Categories>Testing</Categories><GalleryFlags>Public</GalleryFlags><Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="^1.93.0"/></Properties></Metadata><Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation><Dependencies/><Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/></Assets></PackageManifest>'
    }
    foreach ($name in $metadata.Keys) {
        $writer = [System.IO.StreamWriter]::new($archive.CreateEntry($name).Open())
        try { $writer.Write($metadata[$name]) } finally { $writer.Dispose() }
    }
} finally { $archive.Dispose() }
Write-Output $archivePath
