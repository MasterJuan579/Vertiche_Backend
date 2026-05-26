/* ============================================================================
 * Archivo: DetalleOrdenModel.ts
 * Generado por: Claude (asistente IA) a partir del ERD Vertiche SortFlow.
 * Descripción: Modelo de DetalleOrden. Líneas de una OrdenCompra: cada
 *              SKU/talla/color con su cantidad esperada.
 * ============================================================================ */
import {Model} from 'sequelize';

interface DetalleOrdenAtributos{
    id:number,
    orden_id:string,
    sku:string,
    talla:string,
    color:string,
    cantidad:number
}

module.exports = (sequelize:any, DataTypes:any)=>{
    class DetalleOrdenModel extends Model<DetalleOrdenAtributos>
    implements DetalleOrdenAtributos{
        id!: number;
        orden_id!: string;
        sku!: string;
        talla!: string;
        color!: string;
        cantidad!: number;
        static associate(models:any){
            //DetalleOrden N:1 OrdenCompra
            DetalleOrdenModel.belongsTo(models.OrdenCompra,{
                foreignKey:'orden_id'
            });
        }
    }
    DetalleOrdenModel.init({
        id:{
            type:DataTypes.INTEGER,
            allowNull:false,
            primaryKey:true,
            autoIncrement:true,
            unique:true
        },
        orden_id:{
            type:DataTypes.STRING,
            allowNull:false,
            references:{
                model:'OrdenCompra',
                key:'orden_id'
            }
        },
        sku:{
            type:DataTypes.STRING,
            allowNull:false
        },
        talla:DataTypes.STRING,
        color:DataTypes.STRING,
        cantidad:{
            type:DataTypes.INTEGER,
            allowNull:false,
            defaultValue:0
        }
    },{
        sequelize,
        modelName:'DetalleOrden'
    });
    return DetalleOrdenModel;
}