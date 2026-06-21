import {exec} from 'child_process';
import {Modal, App, Setting, Platform} from 'obsidian';

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

		if (isMobile) {
			return;
		}

		let code: HTMLElement;
		new Setting(this.contentEl)
			.addButton(btn =>
				btn
					.setButtonText("Copy to Clipboard")
					.setCta()
					.onClick(async () => {
						await copyToClipboard(command);
					})
			)
			.addButton(btn =>
				btn
					.setButtonText("Execute Command")
					.setCta()
					.onClick(async () => {
						btn.setDisabled(true)
						btn.setIcon('loader')

						let output = await execCommand(command);
						btn.setButtonText("Execute Command")
						btn.setDisabled(false)
						code = code ?? this.contentEl.createEl('code')
						code.innerText = output;
					})
			)
			.addButton(btn =>
				btn.setWarning().setButtonText('Close').onClick(() => this.close())
			)
	}
}

function execCommand(command: string) {
	return new Promise<string>((resolve, reject) => {
		exec(command, (error, stdout, stderr) => {
			if (error) {
				console.error(error);
				reject({error,stderr});
			} else {
				resolve(stdout)
			}
		})
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
