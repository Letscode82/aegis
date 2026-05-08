#!/usr/bin/env pwsh
<#
    _docgen.ps1 — Build minimal valid .docx and .xlsx byte arrays
    from the templates in seed-data/documents/index.json.

    A .docx is a ZIP with three required parts:
      - [Content_Types].xml
      - _rels/.rels
      - word/document.xml

    A .xlsx is a ZIP with five required parts:
      - [Content_Types].xml
      - _rels/.rels
      - xl/_rels/workbook.xml.rels
      - xl/workbook.xml
      - xl/worksheets/sheet1.xml

    The shapes here are intentionally minimal — readable in Word/Excel,
    text content searchable, suitable for AEGIS auto-discovery and the
    MARC content sampling demos. Not for any production document use.
#>

. (Join-Path $PSScriptRoot '_lib.ps1')

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Get-DocumentTemplate {
    param([Parameter(Mandatory)][string]$TemplateKey)
    $idx = Get-SeedJson 'documents/index.json'
    if (-not $idx.documents.PSObject.Properties[$TemplateKey]) {
        throw "Document template not found: $TemplateKey"
    }
    return $idx.documents.$TemplateKey
}

function ConvertTo-DocxXmlEscaped {
    param([string]$Text)
    return ($Text -replace '&', '&amp;' -replace '<', '&lt;' -replace '>', '&gt;')
}

function New-DocxBytes {
    param(
        [Parameter(Mandatory)][string]$Title,
        [Parameter(Mandatory)][string]$Body
    )

    $contentTypes = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>
'@

    $relsRoot = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>
'@

    # Title as h1, then each line of body as either heading (#-prefixed) or paragraph or bullet.
    $sb = New-Object System.Text.StringBuilder
    [void]$sb.AppendLine('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')
    [void]$sb.AppendLine('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">')
    [void]$sb.AppendLine('  <w:body>')
    [void]$sb.AppendLine("    <w:p><w:pPr><w:pStyle w:val=`"Title`"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val=`"32`"/></w:rPr><w:t xml:space=`"preserve`">$(ConvertTo-DocxXmlEscaped $Title)</w:t></w:r></w:p>")

    foreach ($rawLine in ($Body -split "`n")) {
        $line = $rawLine.TrimEnd("`r")
        if (-not $line.Trim()) {
            [void]$sb.AppendLine('    <w:p/>')
            continue
        }
        $escaped = ConvertTo-DocxXmlEscaped $line
        if ($line -match '^# ') {
            $escaped = ConvertTo-DocxXmlEscaped ($line -replace '^# ', '')
            [void]$sb.AppendLine("    <w:p><w:r><w:rPr><w:b/><w:sz w:val=`"28`"/></w:rPr><w:t xml:space=`"preserve`">$escaped</w:t></w:r></w:p>")
        } elseif ($line -match '^## ') {
            $escaped = ConvertTo-DocxXmlEscaped ($line -replace '^## ', '')
            [void]$sb.AppendLine("    <w:p><w:r><w:rPr><w:b/><w:sz w:val=`"24`"/></w:rPr><w:t xml:space=`"preserve`">$escaped</w:t></w:r></w:p>")
        } elseif ($line -match '^### ') {
            $escaped = ConvertTo-DocxXmlEscaped ($line -replace '^### ', '')
            [void]$sb.AppendLine("    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space=`"preserve`">$escaped</w:t></w:r></w:p>")
        } elseif ($line -match '^\s*- ') {
            $escaped = ConvertTo-DocxXmlEscaped ($line -replace '^\s*- ', '• ')
            [void]$sb.AppendLine("    <w:p><w:r><w:t xml:space=`"preserve`">$escaped</w:t></w:r></w:p>")
        } else {
            [void]$sb.AppendLine("    <w:p><w:r><w:t xml:space=`"preserve`">$escaped</w:t></w:r></w:p>")
        }
    }

    [void]$sb.AppendLine('  </w:body>')
    [void]$sb.AppendLine('</w:document>')
    $documentXml = $sb.ToString()

    return New-ZipBytes -Entries @{
        '[Content_Types].xml' = $contentTypes
        '_rels/.rels'         = $relsRoot
        'word/document.xml'   = $documentXml
    }
}

function New-XlsxBytes {
    param(
        [Parameter(Mandatory)][string]$Title,
        [Parameter(Mandatory)] $Sheet  # PSObject with .headers and .rows
    )

    $contentTypes = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>
'@

    $relsRoot = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>
'@

    $workbookXml = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="$(ConvertTo-DocxXmlEscaped $Title)" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>
"@

    $workbookRels = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>
'@

    $sb = New-Object System.Text.StringBuilder
    [void]$sb.AppendLine('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')
    [void]$sb.AppendLine('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">')
    [void]$sb.AppendLine('  <sheetData>')

    $rowIndex = 1
    function Add-Row {
        param([Parameter(Mandatory)] $Cells, [int]$Index, [System.Text.StringBuilder]$Sb)
        [void]$Sb.AppendLine("    <row r=`"$Index`">")
        $colIdx = 0
        foreach ($cell in $Cells) {
            $colLetter = [char](65 + $colIdx)
            $ref = "$colLetter$Index"
            if ($cell -is [int] -or $cell -is [double] -or $cell -is [decimal] -or $cell -is [long]) {
                [void]$Sb.AppendLine("      <c r=`"$ref`" t=`"n`"><v>$cell</v></c>")
            } else {
                $escaped = ConvertTo-DocxXmlEscaped ([string]$cell)
                [void]$Sb.AppendLine("      <c r=`"$ref`" t=`"inlineStr`"><is><t xml:space=`"preserve`">$escaped</t></is></c>")
            }
            $colIdx++
        }
        [void]$Sb.AppendLine('    </row>')
    }

    Add-Row -Cells $Sheet.headers -Index $rowIndex -Sb $sb
    foreach ($row in $Sheet.rows) {
        $rowIndex++
        Add-Row -Cells $row -Index $rowIndex -Sb $sb
    }

    [void]$sb.AppendLine('  </sheetData>')
    [void]$sb.AppendLine('</worksheet>')
    $sheetXml = $sb.ToString()

    return New-ZipBytes -Entries @{
        '[Content_Types].xml'           = $contentTypes
        '_rels/.rels'                   = $relsRoot
        'xl/workbook.xml'               = $workbookXml
        'xl/_rels/workbook.xml.rels'    = $workbookRels
        'xl/worksheets/sheet1.xml'      = $sheetXml
    }
}

function New-ZipBytes {
    param([Parameter(Mandatory)][hashtable]$Entries)

    $ms = New-Object System.IO.MemoryStream
    $archive = New-Object System.IO.Compression.ZipArchive($ms, [System.IO.Compression.ZipArchiveMode]::Create, $true)
    try {
        foreach ($name in $Entries.Keys) {
            $entry = $archive.CreateEntry($name, [System.IO.Compression.CompressionLevel]::Optimal)
            $stream = $entry.Open()
            try {
                $writer = New-Object System.IO.StreamWriter($stream, [System.Text.UTF8Encoding]::new($false))
                $writer.Write($Entries[$name])
                $writer.Flush()
            } finally {
                $stream.Dispose()
            }
        }
    } finally {
        $archive.Dispose()
    }
    return $ms.ToArray()
}

function New-DocumentBytes {
    param(
        [Parameter(Mandatory)][string]$TemplateKey,
        [Parameter(Mandatory)][string]$FileName
    )
    $tpl = Get-DocumentTemplate -TemplateKey $TemplateKey

    if ($FileName -match '\.xlsx$') {
        if (-not $tpl.PSObject.Properties['xlsxSheet']) {
            throw "Template $TemplateKey does not declare xlsxSheet — cannot generate .xlsx for $FileName."
        }
        return ,(New-XlsxBytes -Title $tpl.title -Sheet $tpl.xlsxSheet)
    }
    if ($FileName -match '\.docx$') {
        if (-not $tpl.PSObject.Properties['body']) {
            throw "Template $TemplateKey does not declare body — cannot generate .docx for $FileName."
        }
        return ,(New-DocxBytes -Title $tpl.title -Body $tpl.body)
    }
    throw "Unsupported file extension on $FileName (expected .docx or .xlsx)."
}
