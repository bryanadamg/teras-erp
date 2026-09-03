'use client';

/**
 * Settings home of the plant-wide production quantity formula.
 *
 * The fields and the tester live in `shared/QtyFormulaEditor` because the same
 * editor opens from the gear beside Apply in the Production Run modal; this file
 * is only the Settings chrome around it (panel header, Reset action, Save row).
 */

import { useUser } from '../../context/UserContext';
import { useTheme } from '../../context/ThemeContext';
import { xpBtn, BTN_TONES, XP_BTN } from '../shared/xpTheme';
import { QtyFormulaEditorFields, useQtyFormulaEditor } from '../shared/QtyFormulaEditor';
import SettingsPanel from './SettingsPanel';
import { settingsActions, settingsHint } from './settingsStyles';

export default function QtyFormulaPanel() {
    const { uiStyle } = useTheme();
    const { hasPermission } = useUser();
    const classic = uiStyle === 'classic';
    const canEdit = hasPermission('admin.access');
    const editor = useQtyFormulaEditor();

    return (
        <SettingsPanel
            classic={classic}
            icon="bi-calculator"
            title="Production Quantity Formula"
            right={canEdit ? (
                <button
                    type="button"
                    onClick={editor.reset}
                    style={classic ? xpBtn({ padding: '2px 8px' }) : undefined}
                    className={classic ? XP_BTN : 'btn btn-sm btn-outline-secondary'}
                >
                    <i className="bi bi-arrow-counterclockwise" style={{ marginRight: 4 }}></i>
                    Reset to default
                </button>
            ) : undefined}
        >
            <QtyFormulaEditorFields
                editor={editor}
                classic={classic}
                canEdit={canEdit}
                hint={settingsHint(classic)}
            />

            {canEdit && !editor.loading && (
                <div style={settingsActions(classic)}>
                    <button
                        type="button"
                        onClick={() => { editor.save(); }}
                        disabled={editor.saving || editor.hasErrors}
                        style={classic ? xpBtn({ ...BTN_TONES.primary, padding: '3px 14px' }) : undefined}
                        className={classic ? XP_BTN : 'btn btn-sm btn-primary px-3'}
                    >
                        <i className="bi bi-save" style={{ marginRight: 4 }}></i>
                        {editor.saving ? 'Saving…' : 'Save Formula'}
                    </button>
                </div>
            )}
        </SettingsPanel>
    );
}
