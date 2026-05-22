# Fix all gateway method name mismatches across all studio files

$base = "hoc-ui\src\pages\plugins"

$replacements = @(
    # AudioStudio.tsx
    @{ File = "AudioStudio.tsx"; From = 'method: "chatterbox.speak"'; To = 'method: "chatterbox.generate"' },

    # AudioStudio.tsx - mmaudio
    @{ File = "AudioStudio.tsx"; From = 'method: "mmaudio.generate"'; To = 'method: "mmaudio.synthesize"' },

    # AvatarStudio.tsx - stable-avatar
    @{ File = "AvatarStudio.tsx"; From = 'method: "stable-avatar.animate"'; To = 'method: "avatar.generate"' },
    @{ File = "AvatarStudio.tsx"; From = '"stable-avatar.animate"'; To = '"avatar.generate"' },

    # AvatarStudio.tsx - dgm
    @{ File = "AvatarStudio.tsx"; From = 'method: "dgm.process"'; To = 'method: "dgm.evolve"' },
    @{ File = "AvatarStudio.tsx"; From = '"dgm.process"'; To = '"dgm.evolve"' },

    # ImageStudio.tsx - kv-edit
    @{ File = "ImageStudio.tsx"; From = 'method: "kv-edit.edit"'; To = 'method: "kvedit.generate"' },
    @{ File = "ImageStudio.tsx"; From = '"kv-edit.edit"'; To = '"kvedit.generate"' },

    # VideoStudio.tsx - easyvolcap
    @{ File = "VideoStudio.tsx"; From = 'method: "easyvolcap.process"'; To = 'method: "volcap.run"' },
    @{ File = "VideoStudio.tsx"; From = '"easyvolcap.process"'; To = '"volcap.run"' },
    # Also remove the leftover lingbot-world.generate (from old LingBotWorldPanel)
    @{ File = "VideoStudio.tsx"; From = 'method: "lingbot-world.generate"'; To = 'method: "lingbot.generate"' },

    # AgentStudio.tsx - magentic-one
    @{ File = "AgentStudio.tsx"; From = 'method: "magentic-one.run"'; To = 'method: "magentic.run-task"' },
    @{ File = "AgentStudio.tsx"; From = '"magentic-one.run"'; To = '"magentic.run-task"' },

    # AgentStudio.tsx - openmanus-rl
    @{ File = "AgentStudio.tsx"; From = 'method: "openmanus-rl.run"'; To = 'method: "openmanus.train"' },
    @{ File = "AgentStudio.tsx"; From = '"openmanus-rl.run"'; To = '"openmanus.train"' },

    # AgentStudio.tsx - ai-scientist
    @{ File = "AgentStudio.tsx"; From = 'method: "ai-scientist.research"'; To = 'method: "scientist.research"' },
    @{ File = "AgentStudio.tsx"; From = '"ai-scientist.research"'; To = '"scientist.research"' },

    # DevStudio.tsx - claude-code
    @{ File = "DevStudio.tsx"; From = 'method: "claude-code.run"'; To = 'method: "acc.search"' },
    @{ File = "DevStudio.tsx"; From = '"claude-code.run"'; To = '"acc.search"' },

    # DevStudio.tsx - open-lovable
    @{ File = "DevStudio.tsx"; From = 'method: "open-lovable.generate"'; To = 'method: "lovable.clone"' },
    @{ File = "DevStudio.tsx"; From = '"open-lovable.generate"'; To = '"lovable.clone"' },

    # DevStudio.tsx - uiux-promax
    @{ File = "DevStudio.tsx"; From = 'method: "uiux-promax.design"'; To = 'method: "uiux.designSystem"' },
    @{ File = "DevStudio.tsx"; From = '"uiux-promax.design"'; To = '"uiux.designSystem"' },

    # DevStudio.tsx - superpowers.invoke -> superpowers.listSkills
    @{ File = "DevStudio.tsx"; From = 'method: "superpowers.invoke"'; To = 'method: "superpowers.listSkills"' },
    @{ File = "DevStudio.tsx"; From = '"superpowers.invoke"'; To = '"superpowers.listSkills"' }
)

foreach ($r in $replacements) {
    $path = Join-Path $base $r.File
    if (-not (Test-Path $path)) {
        Write-Host "NOT FOUND: $path"
        continue
    }
    $content = Get-Content $path -Raw
    if ($content -match [regex]::Escape($r.From)) {
        $content = $content -replace [regex]::Escape($r.From), $r.To
        Set-Content $path $content -NoNewline
        Write-Host "FIXED: $($r.File) | $($r.From) -> $($r.To)"
    }
    else {
        Write-Host "NOT FOUND IN FILE: $($r.File) | $($r.From)"
    }
}

Write-Host "Done."
