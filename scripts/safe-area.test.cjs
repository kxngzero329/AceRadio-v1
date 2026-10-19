const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function load(file, imports) {
  const filename = path.join(__dirname, "..", file);
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  new vm.Script(source, { filename }).runInNewContext({
    exports,
    require(name) {
      if (Object.hasOwn(imports, name)) return imports[name];
      throw Error("Unexpected import: " + name);
    },
  });
  return exports;
}

function fixture(platform, initialInsets) {
  let insets = initialInsets;
  const native = {
    Platform: { OS: platform },
    View: "View",
    Text: "Text",
    Pressable: "Pressable",
    ScrollView: "ScrollView",
    Animated: { View: "AnimatedView" },
    StyleSheet: { create: (style) => style },
  };
  const { ScreenSafeArea } = load("src/components/ScreenSafeArea.tsx", {
    "react/jsx-runtime": require("react/jsx-runtime"),
    "react-native": native,
    "react-native-safe-area-context": {
      SafeAreaView: "NativeSafeAreaView",
      useSafeAreaInsets: () => insets,
    },
  });
  return {
    ScreenSafeArea,
    native,
    update: (next) => {
      insets = next;
    },
  };
}
const flatten = (style) =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

test("iOS screen padding uses the provider's measured safe area even when a modal's native view has no insets", () => {
  // The native SafeAreaView stub intentionally applies no padding, representing
  // a reparented/translated iOS modal. Context measurements must still protect it.
  for (const insets of [
    { top: 20, bottom: 0, left: 0, right: 0 },
    { top: 47, bottom: 34, left: 0, right: 0 },
    { top: 59, bottom: 34, left: 0, right: 0 },
    { top: 62, bottom: 34, left: 0, right: 0 },
    { top: 0, bottom: 21, left: 59, right: 59 },
  ]) {
    const { ScreenSafeArea } = fixture("ios", insets);
    const tree = ScreenSafeArea({
      style: { flex: 1, backgroundColor: "black" },
      children: "page",
      testID: "safe-page",
    });
    const style = flatten(tree.props.style);
    assert.equal(tree.type, "View");
    assert.equal(style.paddingTop, insets.top);
    assert.equal(style.paddingBottom, insets.bottom);
    assert.equal(style.paddingLeft, insets.left);
    assert.equal(style.paddingRight, insets.right);
    assert.equal(style.flex, 1);
    assert.equal(tree.props.children, "page");
    assert.equal(tree.props.testID, "safe-page");
  }
});

test("updated iOS safe-area measurements replace old values rather than accumulating padding", () => {
  const f = fixture("ios", { top: 59, bottom: 34, left: 0, right: 0 });
  const props = { style: { flex: 1 } };
  assert.equal(flatten(f.ScreenSafeArea(props).props.style).paddingTop, 59);
  f.update({ top: 20, bottom: 0, left: 0, right: 0 });
  const next = flatten(f.ScreenSafeArea(props).props.style);
  assert.equal(next.paddingTop, 20);
  assert.equal(next.paddingBottom, 0);
  f.update({ top: 0, bottom: 0, left: 0, right: 0 });
  assert.equal(flatten(f.ScreenSafeArea(props).props.style).paddingTop, 0);
});

test("Android and web retain the existing native safe-area view and top/bottom edges without duplicate padding", () => {
  for (const platform of ["android", "web"]) {
    const { ScreenSafeArea } = fixture(platform, {
      top: 24,
      bottom: 48,
      left: 0,
      right: 0,
    });
    const style = { flex: 1 };
    const tree = ScreenSafeArea({ style, children: "page" });
    assert.equal(tree.type, "NativeSafeAreaView");
    assert.equal(tree.props.style, style);
    assert.deepEqual(Array.from(tree.props.edges), ["top", "bottom"]);
    assert.equal(tree.props.children, "page");
  }
});

test("shared detail headers keep the whole back button below iOS unsafe areas and retain guarded dismissal", () => {
  for (const top of [20, 47, 59, 62]) {
    const f = fixture("ios", { top, bottom: 34, left: 0, right: 0 });
    let closes = 0;
    const { ContentSheet } = load("src/components/ContentSheet.tsx", {
      "react/jsx-runtime": require("react/jsx-runtime"),
      "react-native": f.native,
      "@/components/ScreenSafeArea": { ScreenSafeArea: f.ScreenSafeArea },
      "lucide-react-native": { ChevronLeft: "ChevronLeft" },
      "@/hooks/useModalTransition": {
        useModalTransition: () => ({
          close: () => {
            closes++;
          },
          isClosing: false,
          isTransitioning: false,
          style: {},
        }),
      },
      "@/theme/colors": { colors: {} },
      "@/theme/fonts": { fonts: {} },
      "@/theme/layout": { layout: { contentWidth: 640, controlRadius: 12 } },
    });
    const sheet = ContentSheet({
      title: "Station updates",
      testID: "updates",
      children: "content",
    });
    const safeElement = sheet.props.children;
    assert.equal(safeElement.type, f.ScreenSafeArea);
    const padded = safeElement.type(safeElement.props);
    const header = padded.props.children[0];
    const back = header.props.children[0];
    const buttonStyle = back.props.style({ pressed: false })[0];
    const backTop =
      flatten(padded.props.style).paddingTop +
      (header.props.style.minHeight - buttonStyle.height) / 2;
    assert.ok(backTop >= top + 8);
    assert.ok(buttonStyle.width >= 44 && buttonStyle.height >= 44);
    back.props.onPress();
    assert.equal(closes, 1);
    assert.equal(padded.props.children[1].props.children, "content");
  }
});
