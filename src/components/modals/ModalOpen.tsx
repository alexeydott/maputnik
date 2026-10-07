import React, { type DragEvent, type FormEvent } from "react";
import { MdFileUpload } from "react-icons/md";
import { MdAddCircleOutline } from "react-icons/md";
import { Trans, type WithTranslation, withTranslation } from "react-i18next";

import { ModalLoading } from "./ModalLoading";
import { Modal } from "./Modal";
import { InputButton } from "../InputButton";
import { InputUrl } from "../InputUrl";

import { ensureStyleValidity } from "../../libs/style";
import publicStyles from "../../config/styles.json";
import {
  buildStyleFromTileJson,
  fetchJson,
  getCapabilitiesUrl,
  getTileJsonUrl,
  normalizeServerUrl,
} from "../../libs/tegola";
import {
  addYandexBasemap,
  buildBlankStyleWithBasemap,
} from "../../libs/yandex";

type PublicStyleProps = {
  url: string
  thumbnailUrl: string
  title: string
  onSelect(...args: unknown[]): unknown
};

class PublicStyle extends React.Component<PublicStyleProps> {
  render() {
    return <div className="maputnik-public-style">
      <InputButton
        className="maputnik-public-style-button"
        aria-label={this.props.title}
        onClick={() => this.props.onSelect(this.props.url)}
      >
        <div className="maputnik-public-style-header">
          <div>{this.props.title}</div>
          <span className="maputnik-space" />
          <MdAddCircleOutline />
        </div>
        <div
          className="maputnik-public-style-thumbnail"
          style={{
            backgroundImage: `url(${this.props.thumbnailUrl})`
          }}
        ></div>
      </InputButton>
    </div>;
  }
}

type ModalOpenInternalProps = {
  isOpen: boolean
  onOpenToggle(): void
  onStyleOpen(...args: unknown[]): unknown
  fileHandle: FileSystemFileHandle | null
} & WithTranslation;

type ModalOpenState = {
  styleUrl: string
  isDragOver: boolean
  error?: string | null
  activeRequest?: any
  activeRequestUrl?: string | null
  tegolaServerUrl: string
  tegolaMaps: Array<{ name: string }> | null
  tegolaSelectedMap: string | null
  tegolaTileJson: any | null
  tegolaLoading: boolean
  yandexApiKey: string
};

class ModalOpenInternal extends React.Component<ModalOpenInternalProps, ModalOpenState> {
  private fileInputRef = React.createRef<HTMLInputElement>();

  constructor(props: ModalOpenInternalProps) {
    super(props);
    this.state = {
      styleUrl: "",
      isDragOver: false,
      tegolaServerUrl: "",
      tegolaMaps: null,
      tegolaSelectedMap: null,
      tegolaTileJson: null,
      tegolaLoading: false,
      yandexApiKey: "",
    };
  }

  clearError() {
    this.setState({
      error: null
    });
  }

  onCancelActiveRequest(e: Event) {
    // Else the click propagates to the underlying modal
    if (e) e.stopPropagation();

    if (this.state.activeRequest) {
      this.state.activeRequest.abort();
      this.setState({
        activeRequest: null,
        activeRequestUrl: null
      });
    }
  }

  onStyleSelect = (styleUrl: string) => {
    this.clearError();

    let canceled: boolean = false;

    fetch(styleUrl, {
      mode: "cors",
      credentials: "same-origin"
    })
      .then(function (response) {
        return response.json();
      })
      .then((body) => {
        if (canceled) {
          return;
        }

        this.setState({
          activeRequest: null,
          activeRequestUrl: null
        });

        const mapStyle = ensureStyleValidity(body);
        console.log("Loaded style ", mapStyle.id);
        this.props.onStyleOpen(mapStyle);
        this.onOpenToggle();
      })
      .catch((err) => {
        this.setState({
          error: `Failed to load: '${styleUrl}'`,
          activeRequest: null,
          activeRequestUrl: null
        });
        console.error(err);
        console.warn("Could not open the style URL", styleUrl);
      });

    this.setState({
      activeRequest: {
        abort: function () {
          canceled = true;
        }
      },
      activeRequestUrl: styleUrl
    });
  };

  onSubmitUrl = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    this.onStyleSelect(this.state.styleUrl);
  };

  onOpenFile = async () => {
    this.clearError();

    const pickerOpts: OpenFilePickerOptions = {
      types: [
        {
          description: "json",
          accept: { "application/json": [".json"] },
        },
      ],
      multiple: false,
    };

    const [fileHandle] = await window.showOpenFilePicker(pickerOpts) as Array<FileSystemFileHandle>;
    const file = await fileHandle.getFile();
    const content = await file.text();

    let mapStyle;
    try {
      mapStyle = JSON.parse(content);
    } catch (err) {
      this.setState({
        error: (err as Error).toString()
      });
      return;
    }
    mapStyle = ensureStyleValidity(mapStyle);

    this.props.onStyleOpen(mapStyle, fileHandle);
    this.onOpenToggle();
    return file;
  };

  // it is not guaranteed that the File System Access API is available on all
  // browsers. If the function is not available, a fallback behavior is used.
  onFileChanged = (files: FileList | null) => {
    if (!files) return;
    if (files.length === 0) return;
    const file = files[0];
    const reader = new FileReader();
    this.clearError();

    reader.readAsText(file, "UTF-8");
    reader.onload = e => {
      let mapStyle;
      try {
        mapStyle = JSON.parse(e.target?.result as string);
      }
      catch (err) {
        this.setState({
          error: (err as Error).toString()
        });
        return;
      }
      mapStyle = ensureStyleValidity(mapStyle);
      this.props.onStyleOpen(mapStyle);
      this.onOpenToggle();
    };
    reader.onerror = e => console.log(e.target);
  };

  onOpenToggle() {
    this.setState({
      styleUrl: "",
      isDragOver: false,
      tegolaMaps: null,
      tegolaSelectedMap: null,
      tegolaTileJson: null,
      tegolaLoading: false,
    });
    this.clearError();
    this.props.onOpenToggle();
  }

  onBrowseClick = async () => {
    if (typeof window.showOpenFilePicker === "function") {
      await this.onOpenFile();
      return;
    }

    this.fileInputRef.current?.click();
  };

  onFileDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (!this.state.isDragOver) {
      this.setState({ isDragOver: true });
    }
  };

  onFileDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    this.setState({ isDragOver: false });
  };

  onFileDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    this.setState({ isDragOver: false });
    this.onFileChanged(e.dataTransfer.files);
  };

  onChangeUrl = (url: string) => {
    this.setState({
      styleUrl: url,
    });
  };

  onTegolaServerUrlChange = (url: string) => {
    this.setState({
      tegolaServerUrl: url,
    });
  };

  onTegolaConnect = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    this.clearError();
    const serverUrl = normalizeServerUrl(this.state.tegolaServerUrl);
    if (!serverUrl) {
      return;
    }
    this.setState({
      tegolaLoading: true,
      tegolaMaps: null,
      tegolaSelectedMap: null,
      tegolaTileJson: null,
    });
    try {
      const data = await fetchJson(getCapabilitiesUrl(serverUrl));
      const maps = (data.maps || []).map((m: any) => ({ name: m.name }));
      this.setState({
        tegolaMaps: maps,
        tegolaServerUrl: serverUrl,
        tegolaLoading: false,
      });
    } catch (err) {
      this.setState({
        error: `Tegola: failed to load capabilities from '${serverUrl}': ${(err as Error).message}`,
        tegolaLoading: false,
      });
    }
  };

  onTegolaSelectMap = async (mapName: string) => {
    this.clearError();
    const serverUrl = normalizeServerUrl(this.state.tegolaServerUrl);
    this.setState({
      tegolaLoading: true,
      tegolaSelectedMap: mapName,
      tegolaTileJson: null,
    });
    try {
      const tileJson = await fetchJson(getTileJsonUrl(serverUrl, mapName));
      this.setState({
        tegolaTileJson: tileJson,
        tegolaLoading: false,
      });
    } catch (err) {
      this.setState({
        error: `Tegola: failed to load TileJSON for map '${mapName}': ${(err as Error).message}`,
        tegolaLoading: false,
      });
    }
  };

  onTegolaOpen = () => {
    this.clearError();
    const serverUrl = normalizeServerUrl(this.state.tegolaServerUrl);
    const mapName = this.state.tegolaSelectedMap;
    const tileJson = this.state.tegolaTileJson;
    if (!mapName || !tileJson) {
      return;
    }
    try {
      let style = buildStyleFromTileJson(serverUrl, mapName, tileJson);
      const yandexKey = this.state.yandexApiKey.trim();
      if (yandexKey) {
        style = addYandexBasemap(style, yandexKey);
        console.log("Added Yandex basemap underneath tegola layers");
      }
      const mapStyle = ensureStyleValidity(style);
      console.log("Created style from tegola map ", mapName);
      this.props.onStyleOpen(mapStyle);
      this.onOpenToggle();
    } catch (err) {
      this.setState({
        error: `Tegola: failed to build style: ${(err as Error).message}`,
      });
    }
  };

  onYandexApiKeyChange = (apiKey: string) => {
    this.setState({
      yandexApiKey: apiKey,
    });
  };

  onYandexOpen = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    this.clearError();
    const apiKey = this.state.yandexApiKey.trim();
    if (!apiKey) {
      return;
    }
    try {
      const style = buildBlankStyleWithBasemap(apiKey);
      const mapStyle = ensureStyleValidity(style);
      console.log("Created blank style with Yandex basemap");
      this.props.onStyleOpen(mapStyle);
      this.onOpenToggle();
    } catch (err) {
      this.setState({
        error: `Yandex basemap: failed to build style: ${(err as Error).message}`,
      });
    }
  };

  renderTegolaSection() {
    const t = this.props.t;
    const { tegolaServerUrl, tegolaMaps, tegolaSelectedMap, tegolaTileJson, tegolaLoading } = this.state;

    let mapsElement = null;
    if (tegolaMaps) {
      if (tegolaMaps.length === 0) {
        mapsElement = <p>{t("No maps found on this server.")}</p>;
      } else {
        mapsElement = (
          <div>
            {tegolaMaps.map(m => (
              <div key={m.name} style={{ marginBottom: 4 }}>
                <InputButton
                  data-wd-key={`modal:open.tegola.map.${m.name}`}
                  className={tegolaSelectedMap === m.name ? "maputnik-big-button" : ""}
                  aria-label={m.name}
                  onClick={() => void this.onTegolaSelectMap(m.name)}
                >{m.name}</InputButton>
              </div>
            ))}
          </div>
        );
      }
    }

    let mapDetailElement = null;
    if (tegolaTileJson && tegolaSelectedMap) {
      const vectorLayers = tegolaTileJson.vector_layers || [];
      mapDetailElement = (
        <div style={{ marginTop: 8 }}>
          <p>{t("Map")}: <strong>{tegolaSelectedMap}</strong> — {t("{{count}} vector layers", { count: vectorLayers.length })}</p>
          <ul>
            {vectorLayers.map((l: any) => (
              <li key={l.id}>
                {l.id}
                {(l.minzoom !== undefined || l.maxzoom !== undefined) &&
                  ` (z${l.minzoom ?? 0}–${l.maxzoom ?? 22})`}
              </li>
            ))}
          </ul>
          <InputButton
            data-wd-key="modal:open.tegola.open"
            className="maputnik-big-button"
            onClick={this.onTegolaOpen}
          >{t("Open in Style Editor")}</InputButton>
          {this.state.yandexApiKey.trim() && (
            <p style={{ marginTop: 4, fontSize: "0.9em" }}>
              {t("Yandex API key is set — the basemap will be added underneath.")}
            </p>
          )}
        </div>
      );
    }

    return (
      <section className="maputnik-modal-section">
        <form onSubmit={this.onTegolaConnect}>
          <h1>{t("Tegola")}</h1>
          <p>
            <Trans t={t}>
              Connect to a <a href="https://tegola.io" target="_blank" rel="noopener noreferrer">Tegola</a> vector tile server to edit styles for its maps.
            </Trans>
          </p>
          <InputUrl
            aria-label={t("Tegola server URL")}
            data-wd-key="modal:open.tegola.url.input"
            type="text"
            className="maputnik-input"
            default={t("Enter server URL...")}
            value={tegolaServerUrl}
            onInput={this.onTegolaServerUrlChange}
            onChange={this.onTegolaServerUrlChange}
          />
          <div>
            <InputButton
              data-wd-key="modal:open.tegola.connect.button"
              type="submit"
              className="maputnik-big-button"
              disabled={tegolaServerUrl.length < 1 || tegolaLoading}
            >{tegolaLoading ? t("Loading...") : t("Connect")}</InputButton>
          </div>
        </form>
        {mapsElement}
        {mapDetailElement}
      </section>
    );
  }

  renderYandexSection() {
    const t = this.props.t;
    const { yandexApiKey } = this.state;

    return (
      <section className="maputnik-modal-section">
        <form onSubmit={this.onYandexOpen}>
          <h1>{t("Yandex basemap")}</h1>
          <p>
            <Trans t={t}>
              Add the free <a href="https://yandex.ru/maps-api/products/tiles-api" target="_blank" rel="noopener noreferrer">Yandex Maps Tiles API</a> raster basemap (0 &#8381;, up to 30 req/s) underneath your style. Get the API key in the Yandex developer cabinet ("&#1055;&#1086;&#1076;&#1082;&#1083;&#1102;&#1095;&#1080;&#1090;&#1100; API" &rarr; Tiles API). Attribution &copy; &#1071;&#1085;&#1076;&#1077;&#1082;&#1089; is required and stays visible.
            </Trans>
          </p>
          <InputUrl
            aria-label={t("Yandex API key")}
            data-wd-key="modal:open.yandex.key.input"
            type="text"
            className="maputnik-input"
            default={t("Enter Yandex API key...")}
            value={yandexApiKey}
            onInput={this.onYandexApiKeyChange}
            onChange={this.onYandexApiKeyChange}
          />
          <div>
            <InputButton
              data-wd-key="modal:open.yandex.open.button"
              type="submit"
              className="maputnik-big-button"
              disabled={yandexApiKey.trim().length < 1}
            >{t("Open blank style with Yandex basemap")}</InputButton>
          </div>
          <p style={{ fontSize: "0.9em" }}>
            {t("Tip — paste the key here once, the Tegola section above will then add the basemap underneath automatically.")}
          </p>
        </form>
      </section>
    );
  }

  render() {
    const t = this.props.t;
    const styleOptions = publicStyles.map(style => {
      return <PublicStyle
        key={style.id}
        url={style.url}
        title={style.title}
        thumbnailUrl={style.thumbnail}
        onSelect={this.onStyleSelect}
      />;
    });

    let errorElement;
    if (this.state.error) {
      errorElement = (
        <div className="maputnik-modal-error">
          {this.state.error}
          <a href="#" onClick={() => this.clearError()} className="maputnik-modal-error-close">×</a>
        </div>
      );
    }

    return (
      <div>
        <Modal
          data-wd-key="modal:open"
          isOpen={this.props.isOpen}
          onOpenToggle={() => this.onOpenToggle()}
          title={t("Open Style")}
        >
          {errorElement}
          <section className="maputnik-modal-section">
            <h1>{t("Open local Style")}</h1>
            <p>{t("Open a local JSON style from your computer.")}</p>
            <div
              data-wd-key="modal:open.dropzone"
              className={`maputnik-upload-dropzone${this.state.isDragOver ? " maputnik-upload-dropzone--active" : ""}`}
              role="button"
              tabIndex={0}
              onDragOver={this.onFileDragOver}
              onDragLeave={this.onFileDragLeave}
              onDrop={this.onFileDrop}
              onClick={() => void this.onBrowseClick()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  void this.onBrowseClick();
                }
              }}
            >
              <div className="maputnik-upload-dropzone-content">
                <MdFileUpload className="maputnik-upload-dropzone-icon" aria-hidden="true" />
                <p className="maputnik-upload-dropzone-text">
                  {t("Drag and drop a style JSON file here or click to browse")}
                </p>
              </div>
              <input
                ref={this.fileInputRef}
                data-wd-key="modal:open.file.input"
                type="file"
                style={{ display: "none" }}
                onChange={(e) => this.onFileChanged(e.target.files)}
              />
            </div>
          </section>

          <section className="maputnik-modal-section">
            <form onSubmit={this.onSubmitUrl}>
              <h1>{t("Load from URL")}</h1>
              <p>
                <Trans t={t}>
                  Load from a URL. Note that the URL must have <a href="https://enable-cors.org" target="_blank" rel="noopener noreferrer">CORS enabled</a>.
                </Trans>
              </p>
              <InputUrl
                aria-label={t("Style URL")}
                data-wd-key="modal:open.url.input"
                type="text"
                className="maputnik-input"
                default={t("Enter URL...")}
                value={this.state.styleUrl}
                onInput={this.onChangeUrl}
                onChange={this.onChangeUrl}
              />
              <div>
                <InputButton
                  data-wd-key="modal:open.url.button"
                  type="submit"
                  className="maputnik-big-button"
                  disabled={this.state.styleUrl.length < 1}
                >Load from URL</InputButton>
              </div>
            </form>
          </section>

          {this.renderTegolaSection()}

          {this.renderYandexSection()}

          <section className="maputnik-modal-section maputnik-modal-section--shrink">
            <h1>{t("Gallery Styles")}</h1>
            <p>
              {t("Open one of the publicly available styles to start from.")}
            </p>
            <div className="maputnik-style-gallery-container">
              {styleOptions}
            </div>
          </section>
        </Modal>

        <ModalLoading
          isOpen={!!this.state.activeRequest}
          title={t("Loading style")}
          onCancel={(e: Event) => this.onCancelActiveRequest(e)}
          message={t("Loading") + ": " + this.state.activeRequestUrl}
        />
      </div>
    );
  }
}

export const ModalOpen = withTranslation()(ModalOpenInternal);
