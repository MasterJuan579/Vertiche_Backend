/* ============================================================================
 * Archivo: InspeccionQAModel.ts
 * Generado por: Claude (asistente IA) a partir del ERD Vertiche SortFlow.
 * Descripción: Modelo de InspeccionQA. Auditoría de calidad sobre un Tag,
 *              atribuible a un Proveedor y a un operador. Incluye enum
 *              ResultadoQA. La FK al Tag se llama tag_epc (no epc).
 * ============================================================================ */
import {Model} from 'sequelize';

interface InspeccionQAAtributos{
    id:number,
    tag_epc:string,
    proveedor_id:number,
    operador_id:string,
    resultado:string,
    defecto_tipo:string,
    observacion:string,
    fecha:Date
}

export enum ResultadoQA{
    APROBADO = 'APROBADO',
    RECHAZADO = 'RECHAZADO',
    RETRABAJO = 'RETRABAJO',
    PENDIENTE = 'PENDIENTE'
}

module.exports = (sequelize:any, DataTypes:any)=>{
    class InspeccionQAModel extends Model<InspeccionQAAtributos>
    implements InspeccionQAAtributos{
        id!: number;
        tag_epc!: string;
        proveedor_id!: number;
        operador_id!: string;
        resultado!: string;
        defecto_tipo!: string;
        observacion!: string;
        fecha!: Date;
        static associate(models:any){
            //InspeccionQA N:1 Tag (vía tag_epc)
            InspeccionQAModel.belongsTo(models.Tag,{
                foreignKey:'tag_epc'
            });
            //InspeccionQA N:1 Proveedor
            InspeccionQAModel.belongsTo(models.Proveedor,{
                foreignKey:'proveedor_id'
            });
        }
    }
    InspeccionQAModel.init({
        id:{
            type:DataTypes.INTEGER,
            allowNull:false,
            primaryKey:true,
            autoIncrement:true,
            unique:true
        },
        tag_epc:{
            type:DataTypes.STRING,
            allowNull:false,
            references:{
                model:'Tag',
                key:'epc'
            }
        },
        proveedor_id:{
            type:DataTypes.INTEGER,
            allowNull:false,
            references:{
                model:'Proveedor',
                key:'id'
            }
        },
        operador_id:{
            type:DataTypes.STRING,
            allowNull:false
        },
        resultado:{
            type:DataTypes.ENUM,
            values:Object.values(ResultadoQA),
            allowNull:false,
            defaultValue:ResultadoQA.PENDIENTE
        },
        defecto_tipo:DataTypes.STRING,
        observacion:DataTypes.STRING,
        fecha:{
            type:DataTypes.DATE,
            allowNull:false,
            defaultValue:DataTypes.NOW
        }
    },{
        sequelize,
        modelName:'InspeccionQA'
    });
    return InspeccionQAModel;
}