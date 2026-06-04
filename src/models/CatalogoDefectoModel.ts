/* ============================================================================
 * Archivo: CatalogoDefectoModel.ts
 * Descripción: Catálogo de tipos de defecto reconocidos por el sistema QA.
 *              Cada entrada define el nombre exacto que el frontend envía.
 *
 *  Todos los defectos tienen el mismo peso en el score de la inspección.
 *  La penalización uniforme se define en InspeccionQAController (PENALIZACION_POR_DEFECTO).
 *  El campo `penalizacion` queda en el modelo por compatibilidad y referencia,
 *  pero el sistema de scoring ya no lo lee individualmente.
 *
 *  El campo `activo` permite desactivar un defecto sin borrarlo (soft-delete).
 *  Seed inicial: POST /CatalogoDefecto/sembrar (solo si la tabla está vacía).
 * ============================================================================ */
import { Model } from 'sequelize';

interface CatalogoDefectoAtributos {
    id: number;
    nombre: string;
    penalizacion: number;
    descripcion: string;
    activo: boolean;
}

module.exports = (sequelize: any, DataTypes: any) => {
    class CatalogoDefectoModel extends Model<CatalogoDefectoAtributos>
        implements CatalogoDefectoAtributos {
        id!: number;
        nombre!: string;
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
        penalizacion: {
            type: DataTypes.DECIMAL(3, 1),
            allowNull: false,
            defaultValue: 1.0
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