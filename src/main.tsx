import "@logseq/libs";
import "virtual:windi.css";

import React from "react";
import ReactDOM from "react-dom";
import axios from "axios";
import { logseq as PL } from "../package.json";
import {
  BlockIdentity,
  SettingSchemaDesc,
} from "@logseq/libs/dist/LSPlugin.user";
import * as BibTeXParser from "@retorquere/bibtex-parser";
import SearchBar from "./searchbar";
import { handleClosePopup } from "./handleClosePopup";
const css = (t, ...args) => String.raw(t, ...args);

interface cachedBlock {
  uuid: BlockIdentity;
  originalContent: string;
}

var editAgain = true;
const storageBucket = logseq.Assets.makeSandboxStorage();

export const shouldEditAgain = () => {
  return editAgain;
};
export const setEditAgain = () => {
  editAgain = !editAgain;

  setTimeout(() => {
    editAgain = true;
  }, 1000);
};

export const resetEditAgain = () => {
  editAgain = true;
};
export var uuidOriginals = "";
export var originalContentC = "";
export var paperpile = "";
export var paperpileParsed = [];
const pluginId = PL.id;
const settings: SettingSchemaDesc[] = [
  // @ts-expect-error
  {
    key: "bannerHeading",
    title: "Shortcut Settings",
    type: "heading",
  },
  {
    key: "openAsPage",
    title: "Search and open reference as page",
    description: "Shortcut to search and open reference as page",
    default: "mod+shift+o",
    type: "string",
  },
  {
    key: "inlineLitNoteLink",
    title: "Insert inline literature note link",
    description: "Shortcut to insert inline link to literature note",
    default: "mod+shift+i",
    type: "string",
  },
  {
    key: "insertInline",
    title: "Insert inline literature note",
    description: "Shortcut to insert inline literature note",
    default: "mod+shift+l",
    type: "string",
  },
  // @ts-expect-error
  {
    key: "bannerHeading",
    title: "Other settings",
    type: "heading",
  },
  {
    key: "citationReferenceDB",
    title: "Citation DB Name",
    description: "Enter the name of the citation DB. For instructions on how to handle this, check the readme: https://github.com/sawhney17/logseq-citation-manager",
    default: "citationDB.bib",
    type: "string",
  },
  {
    key: "smartsearch",
    title: "Enable smart search?",
    description:
      "Would you like to enable smart search with fuzzy matching or stick with simple keyword based search?",
    default: false,
    type: "boolean",
  },
  {
    key: "indexAbstracts",
    title: "Enable indexing abstract? (Can impact performance!))",
    description:
      "Would you like to to index abstract in search? This would mean that the search results are prioritized primarily by title, but the contents of the abstract is also taken into consideration.",
    default: false,
    type: "boolean",
  },
  {
    key: "templatePage",
    title: "Template Page",
    description:
      "Enter the name of the template page. On creating a literature note, this page's template will be followed. You can use {type}, {author}, {title}, {journal}, {year}, {volume}, {number}, {pages}, {doi}, {url} and other properties as placeholders",
    default: "",
    type: "string",
  },
  {
    key: "templateBlock",
    title: "Template Block",
    description:
      "Enter the name of the template block, use logseq's in built template feature or smartblocks. To create a template, right click and select make template or use instructions in the smartblocks repo. On inserting inline references, this block's template will be followed. You can use {author}, {title}, {journal}, {year}, {volume}, {number}, {pages}, {doi}, {url} as placeholders",
    default: "",
    type: "string",
  },
  {
    key: "linkAlias",
    title: "Optionally Include Link Aliases",
    description:
      "For inserted links, optionally display an alias to the page. i.e. writing '{author lastname} {year}' would create a link to the actual citation page but it would display as the text you entered below. Leave it blank if aliases are not desired. For more about aliases visit: https://aryansawhney.com/pages/the-ultimate-guide-to-aliases-in-logseq/",
    default: "",
    type: "string",
  },
  {
    key: "pageTitle",
    title: "Page Title",
    description:
      "Enter the template for the title of the page. You can use {author}, {title}, {journal}, {year}, {volume}, {number}, {pages}, {doi}, {url} as placeholders",
    default: "{citekey}",
    type: "string",
  },
  {
    key: "reindexOnStartup",
    title: "Reindex on startup?",
    description:
      " Would you like to reindex the DB on startup? This would mean that the search results stay up to date throughuot but would mean lag on the first search after you restart logseq. Recommended with DBs that have less than 1000 references. You can force reindex through the command pallete",
    default: true,
    type: "boolean",
  },
  {
    key: "fileTemplate",
    title: "Template for File URLS",
    description:
      "If a bibtex entry has a file associated with it, when you call {file++}, this template will be applied to each individual link. Use {fileLink} to refer to the link. You can use {title} and {key} as well. ",
    default: "![{title}](file://{fileLink})",
    type: "string",
  },
  {
    key: "resultsCount",
    title: "Number of results to be returned",
    description:
      "This settings controls the maximum number of results returned by a query. If you find yourself frequently scrolling the matches, you may want to increase this, otherwise you can decrease this.",
    type: "number",
    default: 50,
  },
];

const dispatchPaperpileParse = async (mode, uuid) => {
  if (!logseq.settings.reindexOnStartup) {
    if ((await storageBucket.hasItem("paperpileDB.json")) == true) {
      paperpileParsed = JSON.parse(
        await storageBucket.getItem("paperpileDB.json")
      );
    }
  }

  const block = await logseq.Editor.getBlock(uuid);
  if (paperpileParsed.length == 0) {
    logseq.UI.showMsg("No existing DB could be found, reloading DB...");
    getPaperPile();
  } else {
    logseq.Editor.updateBlock(uuid, `inserting...`);
    showDB(paperpileParsed, mode, uuid, block.content);
  }
};
const createDB = (old = false) => {
  const options: BibTeXParser.ParserOptions = {
    errorHandler: (err) => {
      console.warn("Citation plugin: error loading BibLaTeX entry:", err);
    },
  };
  const parsed = BibTeXParser.parse(
    paperpile,
    options
  ) as BibTeXParser.Bibliography;

  paperpileParsed = parsed.entries;

  
    storageBucket.setItem("paperpileDB.json", JSON.stringify(paperpileParsed));
};

const showDB = (parsed, mode, uuid, oc) => {
  editAgain = true;
  paperpileParsed = parsed;
  uuidOriginals = uuid;
  originalContentC = oc;
  ReactDOM.unmountComponentAtNode(document.getElementById("app"));
  ReactDOM.render(
    <React.StrictMode>
      <SearchBar
        paperpileParsed={{
          parse: paperpileParsed,
          currentModeInput: mode,
          currentUuid: uuid,
          originalContent: oc,
        }}
      />
    </React.StrictMode>,
    document.getElementById("app")
  );
  editAgain = true;
  logseq.showMainUI();
  handleClosePopup();
};

const getPaperPile = async () => {
  // ...

  if (await storageBucket.hasItem(`${logseq.settings.citationReferenceDB}`)) {
    let tempPaperpile = await storageBucket.getItem(`${logseq.settings.citationReferenceDB}`);
    // Remove crossref field to avoid circular references
    tempPaperpile = tempPaperpile.replace(/^\s*crossref\s*=\s*{[^}]*},?\s*$/gm, '');
    // Assign the processed data to the global variable paperpile
    paperpile = tempPaperpile;
    createDB();
  }
  else {
    logseq.UI.showMsg(
      "Whoops!, Something went wrong when fetching the citation DB. Please check the path and try again. Make sure your database is in the assets folder.",
      "Error",
      { timeout: 5 }
    );
  }
  // axios
  //   .get(`file://${logseq.settings.citationReferenceDB}`)
  //   .then(async (result) => {
  //     console.log(result)
  //     paperpile = result.data;
  //     if (logseq.settings.citationReferenceDB.endsWith(".json")) {
  //       logseq.UI.showMsg("Sucessfully updated the DB with JSON");
  //       paperpileParsed = JSON.parse(paperpile);
  //     } else {
  //       createDB();
  //     }
  //   })
  //   .catch((err) => {
  //     logseq.UI.showMsg(
  //       "Whoops!, Something went wrong when fetching the citation DB. Please check the path and try again.",
  //       "Error",
  //       { timeout: 5 }
  //     );
  //     console.log(err);
  //   });
  // storageBucket.getItem
};
logseq.useSettingsSchema(settings);
function main() {
  storageBucket.setItem("test", "test");
  logseq.setMainUIInlineStyle({
    zIndex: 11,
  });

  logseq.App.registerCommand(
    "openAsPage",
    {
      key: "openedLitNote",
      label: "Search and open reference as page",
      keybinding: { binding: logseq.settings.openAsPage },
    },
    (e) => {
      dispatchPaperpileParse(1, e.uuid);
    }
  );
  logseq.App.registerCommand(
    "insertLink",
    {
      key: "inlineLitNote",
      label: "Create Inline Link to Lit Note",
      keybinding: { binding: logseq.settings.inlineLitNoteLink },
    },
    (e) => {
      dispatchPaperpileParse(2, e.uuid);
    }
  );
  logseq.App.registerCommand(
    "insertInline",
    {
      key: "inlineNote",
      label: "Create Inline Note",
      keybinding: { binding: logseq.settings.insertInline },
    },
    (e) => {
      dispatchPaperpileParse(0, e.uuid);
    }
  );
  logseq.App.registerCommandPalette(
    {
      key: "ReIndex Citations DB",
      label:
        "Reindex the citation DB in case you made changes to your .bib files",
    },
    (e) => {
      getPaperPile();
    }
  );
  logseq.Editor.registerSlashCommand(
    "Create Inline Literature Note",
    async (e) => {
      dispatchPaperpileParse(0, e.uuid);
    }
  );
  logseq.Editor.registerSlashCommand(
    "Create Inline Link to Lit Note",
    async (e) => {
      dispatchPaperpileParse(2, e.uuid);
    }
  );
  logseq.Editor.registerSlashCommand(
    "Search and open reference as page",
    async (e) => {
      dispatchPaperpileParse(1, e.uuid);
    }
  );
}

logseq.ready(main).catch(console.error);
