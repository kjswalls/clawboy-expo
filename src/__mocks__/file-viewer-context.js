// Mock for FileViewerContext — used in component tests to avoid the full provider chain.
module.exports = {
  useFileViewer: () => ({
    openFile: () => {},
  }),
  FileViewerProvider: ({ children }) => children,
};
