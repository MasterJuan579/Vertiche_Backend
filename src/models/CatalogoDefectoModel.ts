/* ============================================================================
 * Archivo: CatalogoDefectoModel.ts
 * Descripción: Catálogo de tipos de defecto reconocidos por el sistema QA.
 *              Cada entrada define el nombre exacto que el frontend envía,
 *              su criticidad y la penalización que descuenta del score base (5.0).
 *
 *  Criticidad / Penalización:
 *    MENOR   → -0.5   (ej. Etiqueta incorrecta, SKU equivocado)
 *    ALTO    → -1.5   (ej. Mancha o suciedad, Costura defectuosa, Cantidad faltante)
 *    CRITICO → -2.5   (ej. Ruptura o rasgadura, Mala calidad en la tela)
 *
 *  El campo `activo` permite desactivar un defecto sin borrarlo (soft-delete).
 *  Seed inicial: POST /CatalogoDefecto/sembrar (solo si la tabla está vacía).
 * ============================================================================ */
import { Model } from 'sequelize';

export enum CriticidadDefecto {
    MENOR   = 'MENOR',
    ALTO    = 'ALTO',
    CRITICO = 'CRITICO'
}

interface CatalogoDefectoAtributos {
    id: number;
    nombre: string;
    criticidad: string;
    penalizacion: number;
    descripcion: string;
    activo: boolean;
}

module.exports = (sequelize: any, DataTypes: any) => {
    class CatalogoDefectoModel extends Model<CatalogoDefectoAtributos>
        implements CatalogoDefectoAtributos {
        id!: number;
        nombre!: string;
        criticidad!: string;
        penalizacion!: number;
        descripcion!: string;
        activo!: boolean;

        static associate(_models: any) {}
    }

    CatalogoDefectoModel.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
            unique: true
        },
        nombre: {
            type: DataTypes.STRING(100),
            allowNull: false,
            unique: true
        },
        criticidad: {
            type: DataTypes.ENUM,
            values: Object.values(CriticidadDefecto),
            allowNull: false
        },
        penalizacion: {
            type: DataTypes.DECIMAL(3, 1),
            allowNull: false
        },
        descripcion: {
            type: DataTypes.STRING(255),
            defaultValue: ''
        },
        activo: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        }
    }, {
        sequelize,
        modelName: 'CatalogoDefecto'
    });

    return CatalogoDefectoModel;
};