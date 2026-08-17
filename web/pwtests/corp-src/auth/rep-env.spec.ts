import {expect, test, type Page,} from "@playwright/test";
import {CORP_URL, viewports,} from "../../testInit";
import {expectCardSnapshot, sensitiveTextMasks} from "../testHelper";