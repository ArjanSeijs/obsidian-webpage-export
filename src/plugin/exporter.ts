import { Notice, TFile, TFolder } from "obsidian";
import { Path } from "src/plugin/utils/path";
import { ExportPreset, Settings, SettingsPage } from "src/plugin/settings/settings";
import { Utils } from "src/plugin/utils/utils";
import { Website } from "src/plugin/website/website";
import { ExportLog, MarkdownRendererAPI } from "src/plugin/render-api/render-api";
import { ExportInfo, ExportModal } from "src/plugin/settings/export-modal";
import { Webpage } from "./website/webpage";

export class HTMLExporter
{
	static async updateSettings(usePreviousSettings: boolean = false, overrideFiles: TFile[] | undefined = undefined, overrideExportPath: Path | undefined = undefined): Promise<ExportInfo | undefined>
	{
		if (!usePreviousSettings) 
		{
			const modal = new ExportModal();
			if(overrideFiles) modal.overridePickedFiles(overrideFiles);
			return await modal.open();
		}
		
		const files = Settings.exportOptions.filesToExport[0];
		const path = overrideExportPath ?? new Path(Settings.exportOptions.exportPath);

		if ((files.length == 0 && overrideFiles == undefined) || !path.exists || !path.isAbsolute || !path.isDirectory)
		{
			new Notice("Please set the export path and files to export in the settings first.", 5000);
			const modal = new ExportModal();
			if(overrideFiles) modal.overridePickedFiles(overrideFiles);
			return await modal.open();
		}

		return undefined;
	}

	public static async export(usePreviousSettings: boolean = true, overrideFiles: TFile[] | undefined = undefined, overrideExportPath: Path | undefined = undefined)
	{
		const info = await this.updateSettings(usePreviousSettings, overrideFiles, overrideExportPath);
		if ((!info && !usePreviousSettings) || (info && info.canceled)) return;

		const files = info?.pickedFiles ?? overrideFiles ?? Settings.getFilesToExport();
		const exportPath = overrideExportPath ?? info?.exportPath ?? new Path(Settings.exportOptions.exportPath);

		const website = await HTMLExporter.exportFiles(files, exportPath, true, Settings.deleteOldFiles);

		if (!website) return;
		if (Settings.openAfterExport) Utils.openPath(exportPath);
		new Notice("✅ Finished HTML Export:\n\n" + exportPath, 5000);
	}

	public static doPublish(file : TFile | null) : file is TFile {
		if(!file) return false;
		const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
		if (frontmatter && (frontmatter.publish === "false" || frontmatter.publish === false)) {
			ExportLog.log(`Skipping file with publish=false: ${file.path}`);
			return false;
		}
		if (frontmatter && (frontmatter.publish === "true" || frontmatter.publish === true || frontmatter.publish?.toLowerCase() === "secret")) {
			return true;
		}
		return Settings.fileBlacklist.every((pattern) => !file.path.match(new RegExp(pattern)))
	}

	private static unique(value : TFile, index : number, array : TFile[]) {
		return array.findIndex(other => other.path === value.path) === index
	}

	public static collect(file : TFile, depth = 2, acc : string[] = []) : TFile[] {
		if(depth <= 0) return []
		if(acc.includes(file.path)) return []
			
		const cache = app.metadataCache.getFileCache(file)
		if(!cache) return []
		
		const frontmatterLinks = cache.frontmatterLinks ?? []
		const links = cache.links ?? []
		const embeds = cache.embeds ?? []

		// Links in this file
		const allLinks = [...frontmatterLinks,...links,...embeds]
			.map(link => app.metadataCache.getFirstLinkpathDest(link.link,""))
			.filter(link => this.doPublish(link))
			.filter(this.unique)
		// Recurse on links in this file.
		const collectedLinks = allLinks
			.filter(link => !acc.includes(link.path))
			.flatMap(link => this.collect(link, depth - 1, [file.path, ...acc]))
			.filter(link => this.doPublish(link))
			.filter(this.unique)
			
		return [...allLinks, ...collectedLinks]
			.filter(this.unique)
	}

	public static async exportFiles(files: TFile[], destination: Path, saveFiles: boolean, deleteOld: boolean) : Promise<Website | undefined>
	{
		MarkdownRendererAPI.beginBatch();
		files = files.filter(file => this.doPublish(file))
		files = files.flatMap(file => [file,...this.collect(file)]).filter(this.unique)
		let website = undefined;
		try
		{
			website = await (await new Website(destination).load(files)).build();

			if (!website)
			{
				new Notice("❌ Export Cancelled", 5000);
				return;
			}

			if (deleteOld)
			{
				let i = 0;
				ExportLog.addToProgressCap(website.index.deletedFiles.length / 2);
				for (const dFile of website.index.deletedFiles)
				{
					const path = new Path(dFile, destination.path);
					
					// don't delete font files
					// this is a hacky way to prevent it from deleting the matjax and other font files used in only certain files
					if (path.extension == "woff" || path.extension == "woff2" || path.extension == "ttf" || path.extension == "otf")
					{
						ExportLog.progress(0.5, "Deleting Old Files", "Skipping: " + path.path, "var(--color-yellow)");
						continue;
					}

					await path.delete();
					ExportLog.progress(0.5, "Deleting Old Files", "Deleting: " + path.path, "var(--color-red)");
					i++;
				};

				await Path.removeEmptyDirectories(destination.path);
			}
			
			if (saveFiles) 
			{
				if (Settings.exportOptions.combineAsSingleFile)
				{
					await website.saveAsCombinedHTML();
				}
				else
				{
					await Utils.downloadAttachments(website.index.newFiles.filter((f) => !(f instanceof Webpage)));
					await Utils.downloadAttachments(website.index.updatedFiles.filter((f) => !(f instanceof Webpage)));

					if (Settings.exportPreset != ExportPreset.RawDocuments)
					{
						await Utils.downloadAttachments([website.index.websiteDataAttachment()]);
						await Utils.downloadAttachments([website.index.indexDataAttachment()]);
					}
				}
			}
		}
		catch (e)
		{
			new Notice("❌ Export Failed: " + e, 5000);
			ExportLog.error(e, "Export Failed", true);
		}

		MarkdownRendererAPI.endBatch();

		return website;
	}

	public static async exportFolder(folder: TFolder, rootExportPath: Path, saveFiles: boolean, clearDirectory: boolean) : Promise<Website | undefined>
	{
		const folderPath = new Path(folder.path);
		const allFiles = app.vault.getFiles();
		const files = allFiles.filter((file) => new Path(file.path).directory.path.startsWith(folderPath.path));

		return await this.exportFiles(files, rootExportPath, saveFiles, clearDirectory);
	}

	public static async exportVault(rootExportPath: Path, saveFiles: boolean, clearDirectory: boolean) : Promise<Website | undefined>
	{
		const files = app.vault.getFiles();
		return await this.exportFiles(files, rootExportPath, saveFiles, clearDirectory);
	}

}