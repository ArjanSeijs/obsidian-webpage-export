import { exec } from 'child_process';
import {Modal, App, Setting, Platform, Notice} from 'obsidian';

export class CommandModal extends Modal {
    constructor(app: App, command: string) {
        super(app);
        this.setTitle("Sync files command")

        let isMobile = Platform.isMobile || Platform.isMobileApp

        new Setting(this.contentEl)
            .setName('Command')
            .addTextArea(textArea => {
                textArea.setValue(!isMobile ? command : 'Not supported on mobile')
                textArea.onChange(value => {
                    command = value
                })
            })

        if (!isMobile) {
            new Setting(this.contentEl)
                .addButton(btn =>
                    btn
                        .setButtonText("Copy to Clipboard")
                        .setCta()
                        .onClick(async () => { await copyToClipboard(command); this.close() })
                )

            new Setting(this.contentEl)
                .addButton(btn =>
                    btn
                        .setButtonText("Execute Command")
                        .setCta()
                        .onClick(() => { execute(command, true); this.close() })
                )
        }
    }
}

function execute(command: string, notice= false) {
    exec(command, { env: process.env }, (error, stdout) => {
        if (error) console.error(error)
        console.log(stdout)
		if (notice) new Notice(stdout)
    })
}

async function copyToClipboard(text: string) {
    try {
        await navigator.clipboard.writeText(text);
        console.log('Copied successfully!');
    } catch (e) {
        console.error('Failed to copy:', e);
    }
}
