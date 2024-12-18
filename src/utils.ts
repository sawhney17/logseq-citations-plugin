import React, { useState } from "react";
import { useMountedState } from "react-use";
// import * as BibTeXParser from "@retorquere/bibtex-parser";
import { BlockEntity, PageIdentity } from "@logseq/libs/dist/LSPlugin.user";
import { Entry } from "@retorquere/bibtex-parser";
// import { cachedOperations, performCachedOperations } from "./main";

const reg = /{.*}/g;
var data = null;
var type = "";
var citeKey = "";
var fields: { [key: string]: string[] } = {};

export const useAppVisible = () => {
  const [visible, setVisible] = useState(logseq.isMainUIVisible);
  const isMounted = useMountedState();
  React.useEffect(() => {
    const eventName = "ui:visible:changed";
    const handler = async ({ visible }: any) => {
      if (isMounted()) {
        setVisible(visible);
      }
    };
    logseq.on(eventName, handler);
    return () => {
      logseq.off(eventName, handler);
    };
  }, []);
  return visible;
};

export const useSidebarVisible = () => {
  const [visible, setVisible] = useState(false);
  const isMounted = useMountedState();
  React.useEffect(() => {
    logseq.App.onSidebarVisibleChanged(({ visible }) => {
      if (isMounted()) {
        setVisible(visible);
      }
    });
  }, []);
  return visible;
};

const parseTemplate = (text) => {
  var template = text;
  template = template.replaceAll("{citekey}", citeKey);
  template = template.replaceAll("{key}", citeKey);
  template = template.replaceAll("{type}", type);
  template = template.replaceAll("{notes+}", fields.annote)
  console.log(template);
  try {
    template = template.replaceAll(
      /{author\s*lastname}/g,
      //@ts-ignore-error
      fields.author[0].split(",")[0]
    );
    template = template.replaceAll(
      /{author\s*firstname}/g,
      //@ts-ignore-error
      fields.author[0].split(",")[1]
    );
    template = template.replaceAll(
      /{author\s*lastname}\+/g,
      fields.author.forEach((value) => {
        return value.split(",")[0];
      })
    );
    template = template.replaceAll(
      /{author\s*firstname\+}/g,
      fields.author.forEach((value) => {
        return value.split(",")[1];
      })
    );
  } catch (error) {
    // console.error(error);
  }
  template = template.replaceAll("{file++}", () => {
    let text = "";
    fields.file?.forEach((individualFile) => {
      // Check if the individualFile starts with ':'
      if (individualFile.startsWith(':')) {
        // Remove the leading ':' and the trailing ':PDF' or any similar file type suffix
        individualFile = individualFile.replace(/^:|:.*$/g, '');
      }
      text =
        text +
        `${logseq.settings.fileTemplate
          .replaceAll(/{filelink}/gi, individualFile)
          .replaceAll(/{citekey}/gi, citeKey)
          .replaceAll(/filename/gi, individualFile.split("/")[-1])}`;
    });
    return text;
  });
  for (const key in fields) {
    if (fields.hasOwnProperty(key)) {
      const element = fields[key];
      template = template.replaceAll(`{${key}}`, element[0]);
      template = template.replaceAll(`{${key}+}`, element.toString());
      template = template.replaceAll(`{${key}++}`, () => {
        let text = "";
        element.forEach((elemental) => {
          text = text + `[[${elemental}]]`;
        });
        return text;
      });
    }
  }
  template = template.replaceAll(/{[A-z]*\+*}/g, "");
  return template;
};
const createLiteratureNote = async (isNoteReference, originalContent, uuid) => {
  const pageTitle = parseTemplate(logseq.settings.pageTitle);
  if ((await logseq.Editor.getPage(pageTitle)) == null) {
    const blocks = await parseTemplatePage();
    logseq.Editor.createPage(
      pageTitle,
      { fun: "block" },
      { redirect: isNoteReference }
    ).then((page) => {
      logseq.Editor.getPageBlocksTree(page.name).then((block2) => {
        logseq.Editor.insertBatchBlock(block2[0].uuid, blocks).then(() => {
          logseq.Editor.removeBlock(block2[0].uuid);
        });
      });
    });
  }

  if (!isNoteReference) {
    const currentBlock = await logseq.Editor.getCurrentBlock();

    if (currentBlock != null) {
      //If logseq.settings.linkAlias is not "" then the formattedLink will be [parseTemplate(linkAlias)]([[pageTitle]])
      const formattedLink =
        logseq.settings.linkAlias != ""
          ? `[${parseTemplate(logseq.settings.linkAlias)}]([[${pageTitle}]])`
          : `[[${pageTitle}]]`;
      logseq.Editor.updateBlock(
        currentBlock.uuid,
        `${originalContent}${formattedLink}`
      );
    } else {
      logseq.App.showMsg(
        "Oops, looks like this wasn't called from inside a block. Please try again!"
      );
      logseq.Editor.updateBlock(uuid, `${originalContent}`);
    }
  } else {
    logseq.App.pushState("page", { name: pageTitle });
    logseq.Editor.updateBlock(uuid, `${originalContent}`);
  }
};

const insertLiteratureNoteInline = async (uuid, oc) => {
  const currentBlock = await logseq.Editor.getBlock(uuid);
  let blocks = await parseTemplateBlock();
  logseq.Editor.updateBlock(uuid, oc);
  console.log("bahhh")
  console.log(blocks)
  if (blocks == null){
    return
  }
  if (blocks[0].children.length == 0) {
    console.log("NO children")
    if (currentBlock != null) {
      logseq.Editor.updateBlock(
        currentBlock.uuid,
        `${oc} ${blocks[0].content}`
      ).then(() => {
        // logseq.Editor.insertAtEditingCursor(`${blocks[0].content}`);
      });
      blocks.shift();
    } else {
      if (uuid != undefined && oc != undefined) {
        console.log(oc);
      }
    }
    await logseq.Editor.insertBatchBlock(currentBlock.uuid, blocks, {
      sibling: true,
    });
  }
  else {
    console.log(blocks)
    console.log("Wha'ts up")
    logseq.Editor.updateBlock(
      currentBlock.uuid,
      `${oc} ${blocks[0].content}`
    ).then(() => {
      // logseq.Editor.insertAtEditingCursor(`${blocks[0].content}`);
    });
    await logseq.Editor.insertBatchBlock(currentBlock.uuid, blocks[0].children, {
      sibling: false,
    });
  }
};
// , 1000);};
//Dispatch document keydown event for teh tab key

export const actionRouter = (
  actionKey: any,
  note: Entry,
  uuid = undefined,
  oc = undefined
) => {
  console.log("This is the new found note data");
  console.log(note);
  console.log(note.type + "is the type");
  type = note.type;
  citeKey = note.key;
  fields = note.fields;

  if (actionKey == "inline" || actionKey == 0) {
    insertLiteratureNoteInline(uuid, oc);
  }

  if (actionKey == "goToReference" || actionKey == 1) {
    createLiteratureNote(true, oc, uuid);
  }
  if (actionKey == "insertLink" || actionKey == 2) {
    createLiteratureNote(false, oc, uuid);
  }
  logseq.hideMainUI();
  //provided uuid and Oc is not null, update block
};

const parseTemplatePage = async () => {
  var initialPage: PageIdentity[] = await logseq.Editor.getPageBlocksTree(
    logseq.settings.templatePage
  );
  data = initialPage;
  if (initialPage == null) {
    logseq.UI.showMsg("Error: Template page not found.")
    return null
  }
  data.forEach((item) => {
    triggerParse(item);
  });
  return data;
};

const parseTemplateBlock = async () => {
  var initialBlock: BlockEntity[] = await logseq.DB.q(
    `(property template ${logseq.settings.templateBlock})`
  );
  if (initialBlock!= null) {
    data = await logseq.Editor.getBlock(initialBlock[0].uuid, {
      includeChildren: true,
    });
    triggerParse(data);
    return data.children;
  }
  else {
    logseq.UI.showMsg("Error: Template block not found.")
    return null
  }
};
function triggerParse(block: BlockEntity) {
  if (block.content) {
    delete block.left;
    delete block.file;
    delete block.page;
    delete block.pathrefs;
    delete block.parent;
    delete block.page;
    delete block.level;
    delete block.id;
    let regexMatched = block.content.match(reg);
    for (const x in regexMatched) {
      let toBeParsed = block.content;
      var currentMatch = regexMatched[x];
      let formattedMatch = parseTemplate(currentMatch);
      let newRegexString = toBeParsed.replace(currentMatch, formattedMatch);
      block.content = newRegexString;
      block.properties = {};
    }
  }
  if (block.children) {
    block.children.map(triggerParse);
  }
}
