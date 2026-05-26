/* ============================================================================
 * Archivo: PedidoModel.ts
 * Generado por: Claude (asistente IA) a partir del ERD Vertiche SortFlow.
 * Descripción: Modelo de Pedido. Envío físico de un proveedor (puede
 *              agrupar varias OrdenCompra). Incluye enum EstadoPedido.
 * ============================================================================ */
import {Model} from 'sequelize';

interface PedidoAtributos{
    pedido_id:string,
    proveedor_id:number,
    estado:string,
    fecha_pedido:Date,
    fecha_llegada:Date,
    total_esperados:number,
    total_recibidos:number
}

export enum EstadoPedido{
    PROGRAMADO = 'PROGRAMADO',
    EN_TRANSITO = 'EN_TRANSITO',
    LLEGADO = 'LLEGADO',
    PROCESADO = 'PROCESADO',
    INCOMPLETO = 'INCOMPLETO'
}

module.exports = (sequelize:any, DataTypes:any)=>{
    class PedidoModel extends Model<PedidoAtributos>
    implements PedidoAtributos{
        pedido_id!: string;
        proveedor_id!: number;
        estado!: string;
        fecha_pedido!: Date;
        fecha_llegada!: Date;
        total_esperados!: number;
        total_recibidos!: number;
        static associate(models:any){
            //Pedido N:1 Proveedor
            PedidoModel.belongsTo(models.Proveedor,{
                foreignKey:'proveedor_id'
            });
            //Pedido 1:N Palet (tiene)
            PedidoModel.hasMany(models.Palet,{
                foreignKey:'pedido_id'
            });
            //Pedido 1:N Tag (incluye)
            PedidoModel.hasMany(models.Tag,{
                foreignKey:'pedido_id'
            });
        }
    }
    PedidoModel.init({
        pedido_id:{
            type:DataTypes.STRING,
            allowNull:false,
            primaryKey:true,
            unique:true
        },
        proveedor_id:{
            type:DataTypes.INTEGER,
            allowNull:false,
            references:{
                model:'Proveedor',
                key:'id'
            }
        },
        estado:{
            type:DataTypes.ENUM,
            values:Object.values(EstadoPedido),
            allowNull:false,
            defaultValue:EstadoPedido.PROGRAMADO
        },
        fecha_pedido:{
            type:DataTypes.DATE,
            allowNull:false,
            defaultValue:DataTypes.NOW
        },
        fecha_llegada:DataTypes.DATE,
        total_esperados:{
            type:DataTypes.INTEGER,
            allowNull:false,
            defaultValue:0
        },
        total_recibidos:{
            type:DataTypes.INTEGER,
            allowNull:false,
            defaultValue:0
        }
    },{
        sequelize,
        modelName:'Pedido'
    });
    return PedidoModel;
}