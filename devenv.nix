{ pkgs, lib, config, inputs, ... }:

{
  languages.javascript = {
    enable = true;
    npm.enable = true;
    lsp.enable = true;
  };
  languages.typescript = {
    enable = true;
    lsp.enable = true;
  };
}
