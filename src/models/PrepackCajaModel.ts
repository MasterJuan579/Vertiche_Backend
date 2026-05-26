/* ============================================================================
 * Archivo: PrepackCajaModel.ts
 * Generado por: Claude (asistente IA) a partir del ERD Vertiche SortFlow.
 * Descripción: Modelo de PrepackCaja. Tabla puente entre Tag (prepack) y
 *              Caja: registra cuándo un prepack se vinculó a una caja y si
 *              esa vinculación fue correcta (tag.tienda_id == caja.tienda_id).
 * ============================================================================ */
import {Model} from 'sequelize';

interface PrepackCajaAtributos{
    id:number,
    epc:string,
    caja_id:string,
    timestamp_vinculacion:Date,
    es_correcto:boolean
}

module.exports = (sequelize:any, DataTypes:any)=>{
    class PrepackCajaModel extends Model<PrepackCajaAtributos>
    implements PrepackCajaAtributos{
        id!: number;
        epc!: string;
        caja_id!: string;
        timestamp_vinculacion!: Date;
        es_correcto!: boolean;
        static associate(models:any){
            //PrepackCaja N:1 Tag
            PrepackCajaModel.belongsTo(models.Tag,{
                foreignKey:'epc'
            });
            //PrepackCaja N:1 Caja
            PrepackCajaModel.belongsTo(models.Caja,{
                foreignKey:'caja_id'
            });
        }
    }
    PrepackCajaModel.init({
        id:{
            type:DataTypes.INTEGER,
            allowNull:false,
            primaryKey:true,
            autoIncrement:true,
            unique:true
        },
        epc:{
            type:DataTypes.STRING,
            allowNull:false,
            references:{
                model:'Tag',
                key:'epc'
            }
        },
        caja_id:{
            type:DataTypes.STRING,
            allowNull:false,
            references:{
                model:'Caja',
                key:'caja_id'
            }
        },
        timestamp_vinculacion:{
            type:DataTypes.DATE,
            allowNull:false,
            defaultValue:DataTypes.NOW
        },
        es_correcto:{
            type:DataTypes.BOOLEAN,
            allowNull:false,
            defaultValue:true
        }
    },{
        sequelize,
        modelName:'PrepackCaja'
    });
    return PrepackCajaModel;
}