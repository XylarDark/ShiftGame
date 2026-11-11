import Phaser from "phaser";
import { playUiSfx } from "../../audio/sfx";
import { applyPortraitTexture, portraitImageKey } from "../../art/peopleAtlas";
import { getSim } from "../../session";
import { ackTap } from "../../input/tapAck";
import { enableItemHit } from "../../input/hit";
import { brand } from "../brand";
import { addUiText, type UiInk } from "../text";
import { Color, HUD_TYPE_FIT } from "../theme";
import { GAME_HEIGHT, GAME_WIDTH } from "../../sim/constants";
import type { SafeInset } from "../viewFit";
import {
  ID_CARD_FILL,
  ID_CARD_H,
  ID_CARD_W,
  ID_DENY_INK,
  ID_DOB_PX,
  ID_FIELD_LABEL_H,
  ID_FIELD_ROW_STEP,
  ID_FIELD_VALUE_LEAD,
  ID_FIELD_W,
  ID_FIELD_X,
  ID_HEADER_CAP_MAX_W,
  ID_HEADER_H,
  ID_HEADER_SEAL_D,
  ID_HINT_PX,
  ID_KIND_PX,
  ID_LABEL_PX,
  ID_NAME_PX,
  ID_OK_INK,
  ID_PAD,
  ID_PHOTO_FRAME,
  ID_PHOTO_H,
  ID_PHOTO_W,
  ID_RING_PAD,
  ID_SIG_PX,
  ID_TITLE_PX,
} from "./constants";

function drawSignature(g: Phaser.GameObjects.Graphics, name: string, x: number, y: number, w: number): void {
  const steps = 40;
  const seed = name.length || 1;
  g.beginPath();
  g.moveTo(x, y + 6);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const code = name.charCodeAt(i % Math.max(1, name.length)) || 65;
    const envelope = Math.sin(Math.pow(t, 0.55) * Math.PI) * (1 - t * 0.45);
    const wave = Math.sin(t * Math.PI * 4.6 + code * 0.19) * 11 * envelope;
    const drift = Math.sin(t * Math.PI * 9 + seed * 0.9) * 2.6 * envelope;
    g.lineTo(x + w * t, y + 6 - 10 * envelope + wave + drift);
  }
  g.strokePath();
}

export interface IdCardPayload {
  name: string;
  dob: string;
  matches: boolean;
  age: number;
  idNumber: string;
  expires: string;
}

/**
 * Doorstep ID card panel and its verdict-driven chrome repaint.
 */
export class HudIdCard {
  idDim!: Phaser.GameObjects.Rectangle;
  idPanel!: Phaser.GameObjects.Container;
  idName!: UiInk;
  idDob!: UiInk;
  idHint!: UiInk;
  idTitle!: UiInk;
  idKind!: UiInk;
  idNumber!: UiInk;
  idExpiry!: UiInk;
  idPhoto!: Phaser.GameObjects.Image;
  idFurniture!: Phaser.GameObjects.Graphics;
  idSignature!: Phaser.GameObjects.Graphics;
  idBg!: Phaser.GameObjects.Rectangle;
  idFlashRing!: Phaser.GameObjects.Rectangle;

  private idDrawnFor = "";

  constructor(private readonly scene: Phaser.Scene) {}

  /** Keep the modal card centered in the HUD viewport (resize / safe-area aware). */
  layout(_inset: SafeInset, viewW: number, viewH: number): void {
    const cx = viewW / 2;
    const cy = viewH / 2;
    this.idPanel.setPosition(cx, cy);
    this.idDim.setPosition(cx, cy);
    this.idDim.setSize(viewW, viewH);
  }

  create(): void {
    this.idDim = this.scene.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0a0806, 0.55)
      .setDepth(24)
      .setVisible(false);
    this.idDim.setInteractive({ useHandCursor: false });
    this.idDim.on("pointerdown", (p: Phaser.Input.Pointer) => p.event.stopPropagation());

    const halfW = ID_CARD_W / 2;
    const halfH = ID_CARD_H / 2;
    const headerMid = -halfH + ID_HEADER_H / 2;
    const photoX = -halfW + ID_PAD + ID_PHOTO_W / 2;
    const photoTop = -halfH + ID_HEADER_H + ID_PAD;

    this.idFlashRing = this.scene.add
      .rectangle(0, 0, ID_CARD_W + ID_RING_PAD, ID_CARD_H + ID_RING_PAD, 0x000000, 0)
      .setStrokeStyle(8, Color.lime, 1);
    this.idBg = this.scene.add.rectangle(0, 0, ID_CARD_W, ID_CARD_H, ID_CARD_FILL, 1).setStrokeStyle(6, ID_OK_INK);
    enableItemHit(this.idBg);
    this.idBg.on("pointerdown", (p: Phaser.Input.Pointer) => {
      p.event.stopPropagation();
      ackTap(this.idBg);
      playUiSfx(this.scene.game, "ticket");
      getSim().pressDropoffConfirm();
    });
    this.idBg.on("pointerup", () => getSim().releaseDropoffConfirm());
    this.idBg.on("pointerupoutside", () => getSim().releaseDropoffConfirm());
    this.idFurniture = this.scene.add.graphics();
    this.idSignature = this.scene.add.graphics();

    this.idTitle = addUiText(this.scene, -halfW + ID_PAD, headerMid, brand.idProvince, {
      size: ID_TITLE_PX,
      color: Color.creamHex,
      fontStyle: "700",
      letterSpacing: 1,
      strokeThickness: 0,
      noWrap: true,
      ...HUD_TYPE_FIT,
      maxWidth: ID_HEADER_CAP_MAX_W,
      maxHeight: ID_HEADER_H - 14,
    }).setOrigin(0, 0.5);
    this.idKind = addUiText(this.scene, halfW - ID_PAD, headerMid, "IDENTITY CARD · CLASS G", {
      size: ID_KIND_PX,
      color: Color.creamHex,
      fontStyle: "600",
      letterSpacing: 0.5,
      strokeThickness: 0,
      noWrap: true,
      ...HUD_TYPE_FIT,
      maxWidth: ID_HEADER_CAP_MAX_W,
      maxHeight: ID_HEADER_H - 14,
    }).setOrigin(1, 0.5);

    const photoTex = portraitImageKey("tex-face-0");
    this.idPhoto = this.scene.add
      .image(photoX, photoTop + ID_PHOTO_H / 2, photoTex.key, photoTex.frame)
      .setDisplaySize(ID_PHOTO_W, ID_PHOTO_H);

    this.idName = addUiText(this.scene, ID_FIELD_X, 0, "", {
      size: ID_NAME_PX,
      color: Color.inkHex,
      fontStyle: "700",
      strokeThickness: 0,
      ...HUD_TYPE_FIT,
      maxWidth: ID_FIELD_W,
      maxHeight: 40,
    }).setOrigin(0, 0);
    this.idDob = addUiText(this.scene, ID_FIELD_X, 0, "", {
      size: ID_DOB_PX,
      color: "#3a2418",
      fontStyle: "600",
      strokeThickness: 0,
      ...HUD_TYPE_FIT,
      maxWidth: ID_FIELD_W,
      maxHeight: 30,
    }).setOrigin(0, 0);
    this.idNumber = addUiText(this.scene, ID_FIELD_X, 0, "", {
      size: ID_DOB_PX,
      color: "#3a2418",
      fontStyle: "600",
      letterSpacing: 0.5,
      strokeThickness: 0,
      ...HUD_TYPE_FIT,
      maxWidth: ID_FIELD_W,
      maxHeight: 30,
    }).setOrigin(0, 0);
    this.idHint = addUiText(this.scene, 0, halfH - ID_PAD - 20, "Name matches — tap the card to confirm", {
      size: ID_HINT_PX,
      color: Color.creamHex,
      fontStyle: "700",
      align: "center",
      strokeThickness: 0,
      noWrap: true,
      ...HUD_TYPE_FIT,
      maxWidth: ID_CARD_W - ID_PAD * 4,
      maxHeight: 40,
    }).setOrigin(0.5);

    this.idExpiry = addUiText(this.scene, ID_FIELD_X, 0, "", {
      size: ID_DOB_PX,
      color: "#3a2418",
      fontStyle: "600",
      strokeThickness: 0,
      ...HUD_TYPE_FIT,
      maxWidth: ID_FIELD_W,
      maxHeight: 30,
    }).setOrigin(0, 0);

    const labels = ["NAME", "DATE OF BIRTH", "ID NO.", "EXPIRES"].map((text) =>
      addUiText(this.scene, ID_FIELD_X, 0, text, {
        size: ID_LABEL_PX,
        color: "#8a7a58",
        fontStyle: "700",
        letterSpacing: 1,
        strokeThickness: 0,
        noWrap: true,
        ...HUD_TYPE_FIT,
        maxWidth: ID_FIELD_W,
        maxHeight: ID_FIELD_LABEL_H,
      }).setOrigin(0, 0),
    );
    const sigLabel = addUiText(this.scene, photoX, 0, "SIGNATURE", {
      size: ID_SIG_PX,
      color: "#8a7a58",
      fontStyle: "700",
      letterSpacing: 2,
      strokeThickness: 0,
      noWrap: true,
      ...HUD_TYPE_FIT,
      maxWidth: ID_PHOTO_W,
      maxHeight: 20,
    }).setOrigin(0.5, 0);

    const rowTop = photoTop + 4;
    labels.forEach((label, i) => {
      const y = rowTop + i * ID_FIELD_ROW_STEP;
      label.setPosition(ID_FIELD_X, y);
      const value = [this.idName, this.idDob, this.idNumber, this.idExpiry][i]!;
      value.setPosition(ID_FIELD_X, y + ID_FIELD_VALUE_LEAD);
    });
    const sigTop = photoTop + ID_PHOTO_H + 14;
    sigLabel.setPosition(photoX, sigTop + 44);

    this.idName.setText("SAMPLE CUSTOMER");
    this.idDob.setText("JAN 01 2000");
    this.idNumber.setText("K-0000-00");
    this.idExpiry.setText("EXP 01/30");

    this.idPanel = this.scene.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2, [
      this.idFlashRing,
      this.idBg,
      this.idFurniture,
      this.idPhoto,
      this.idSignature,
      this.idTitle,
      this.idKind,
      ...labels,
      this.idName,
      this.idDob,
      this.idNumber,
      this.idExpiry,
      sigLabel,
      this.idHint,
    ]);
    this.idPanel.setDepth(25).setVisible(false);
  }

  paintIdCard(card: IdCardPayload, idNo: string): void {
    const key = `${card.name}|${card.dob}|${card.matches}|${idNo}`;
    if (key === this.idDrawnFor) return;
    this.idDrawnFor = key;

    const halfW = ID_CARD_W / 2;
    const halfH = ID_CARD_H / 2;
    const ink = card.matches ? ID_OK_INK : ID_DENY_INK;
    const photoX = -halfW + ID_PAD;
    const photoTop = -halfH + ID_HEADER_H + ID_PAD;
    const sigTop = photoTop + ID_PHOTO_H + 14;
    const g = this.idFurniture;

    g.clear();
    g.fillStyle(ink, 1);
    g.fillRect(-halfW, -halfH, ID_CARD_W, ID_HEADER_H);
    const sealY = -halfH + ID_HEADER_H / 2;
    const sealR = ID_HEADER_SEAL_D / 2;
    g.lineStyle(2, 0xfdf6e0, 0.92);
    g.strokeCircle(0, sealY, sealR);
    g.fillStyle(0xfdf6e0, 0.14);
    g.fillCircle(0, sealY, sealR - 2);
    g.lineStyle(1, 0xfdf6e0, 0.55);
    g.strokeCircle(0, sealY, sealR - 7);
    g.fillStyle(ink, 0.06);
    g.fillRect(ID_FIELD_X - 16, photoTop - 8, ID_FIELD_W + 32, ID_PHOTO_H + 16);
    g.lineStyle(1, ink, 0.16);
    for (let y = photoTop; y < halfH - ID_PAD - 52; y += 12) {
      g.lineBetween(ID_FIELD_X - 16, y, ID_FIELD_X + ID_FIELD_W + 16, y);
    }
    g.fillStyle(ink, 1);
    g.fillRect(
      photoX - ID_PHOTO_FRAME,
      photoTop - ID_PHOTO_FRAME,
      ID_PHOTO_W + ID_PHOTO_FRAME * 2,
      ID_PHOTO_H + ID_PHOTO_FRAME * 2,
    );
    g.fillStyle(0xfdf6e0, 1);
    g.fillRect(photoX, sigTop, ID_PHOTO_W, 42);
    g.lineStyle(1, ink, 0.35);
    g.strokeRect(photoX, sigTop, ID_PHOTO_W, 42);
    g.fillStyle(ink, 1);
    g.fillRect(-halfW + ID_PAD, halfH - ID_PAD - 40, ID_CARD_W - ID_PAD * 2, 40);

    this.idSignature.clear();
    this.idSignature.lineStyle(2.5, 0x2a3550, 0.85);
    drawSignature(this.idSignature, card.name, photoX + 12, sigTop + 26, ID_PHOTO_W - 24);
  }
}
