/* ============================================================================
 * Archivo: PrepackLineaModel.ts
 * ──────────────────────────────────────────────────────────────────────────
 * AGREGADO (cambio: prepacks mixtos).
 *
 * Por qué existe:
 *   Un prepack (Tag) tenía un único `talla` + `color`. El requerimiento es que
 *   un prepack pueda venir surtido (varias tallas/colores). Ejemplo:
 *     Prepack → 2 playeras M rojas + 3 S verdes + 2 L azules.
 *
 *   En vez de modificar el modelo Tag (lo cual exigiría un ALTER TABLE manual,
 *   porque sync({force:false}) NO agrega columnas a tablas existentes), se crea
 *   esta TABLA HIJA. sync({force:false}) sí crea tablas nuevas automáticamente,
 *   así que no requiere migración manual ni toca datos existentes.
 *
 * Relación:
 *   PrepackLinea N:1 Tag (vía `epc`). Cada fila es una línea del surtido de un
 *   prepack: (sku, talla, color, cantidad).
 *
 * Nota: la asociación inversa Tag.hasMany(PrepackLinea, as:'lineas') se registra
 *       aquí mismo para NO modificar TagModel.ts (cambio mínimo/no invasivo).
 * ============================================================================ */
import { Model } from 'sequelize';

interface PrepackLineaAtributos {
    id: number,
    epc: string,
    sku: string,
    talla: string,
    color: string,
    cantidad: number
}

module.exports = (sequelize: any, DataTypes: any) => {
    class PrepackLineaModel extends Model<PrepackLineaAtributos>
        implements PrepackLineaAtributos {
        id!: number;
        epc!: string;
        sku!: string;
        talla!: string;
        color!: string;
        cantidad!: number;
        static associate(models: any) {
            // PrepackLinea N:1 Tag
            PrepackLineaModel.belongsTo(models.Tag, {
                foreignKey: 'epc'
            });
            // Inversa Tag 1:N PrepackLinea. Se declara desde aquí para no tocar
            // TagModel.ts. onUpdate CASCADE: si el EPC placeholder cambia a EPC
            // real (asignar-epc), las líneas siguen al tag.
            models.Tag.hasMany(PrepackLineaModel, {
                foreignKey: 'epc',
                as: 'lineas'
            });
        }
    }
    PrepackLineaModel.init({
        id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
            unique: true
        },
        epc: {
            type: DataTypes.STRING,
            allowNull: false,
            references: {
                model: 'Tag',
                key: 'epc'
            },
            onUpdate: 'CASCADE'
        },
        sku: {
            type: DataTypes.STRING,
            allowNull: false
        },
        talla: DataTypes.STRING,
        color: DataTypes.STRING,
        cantidad: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 1
        }
    }, {
        sequelize,
        modelName: 'PrepackLinea'
    });
    return PrepackLineaModel;
}

